# SEO Implementation Status

Tracking against the 26-phase brief. Updated as work completes and is verified (build + local/live checks), not merely written.

> **Reference:** [`docs/scanning-architecture.md`](docs/scanning-architecture.md) — end-to-end map of the card / sealed deal scanning + PPT pricing pipeline, every trust/sanity check and where it runs, current coverage numbers, and the gaps found (with which were fixed vs. reported). Written 2026-08-30.

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

Persisting a daily per-card price snapshot would unlock a genuine movers
/ trend page in ~4–8 weeks. **Now started** — see *Workstream A* below:
`price_history` table + write wired into `/api/sync-watchlist`,
collecting from 2026-08-28. The page itself is still not built (needs the
history depth first).

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

## Price-history logging + UX close-out — 2026-08-29

### Workstream A — `price_history` collection — LIVE (commit `a2419aa`, migration applied 2026-08-28)

The site kept only *current* prices (`watchlist.last_known_price` is
overwritten every sync; `deals.market_price` is per-listing and churns),
so there was no time series to build a movers / trend page from. Started
collecting one now — a movers page needs ~4–8 weeks of history before
it's meaningful, so the clock had to start regardless of when the page
ships.

- **Table `price_history`** (`supabase/price_history_migration.sql`, run
  in the Supabase SQL Editor 2026-08-28) — non-destructive, one new
  table + 3 indexes:

  | column | notes |
  | --- | --- |
  | `id` | `bigint generated always as identity` PK |
  | `tcgplayer_id` | stable card id (`watchlist.justtcg_tcgplayer_id`) |
  | `name`, `"set"`, `language` | denormalised so a row stays readable if the watchlist entry is later retired |
  | `condition` | `'Near Mint'` only today; column reserved for LP/MP/graded rows a future job can add |
  | `price` | USD market reference (PokémonPriceTracker, sold-data-derived) |
  | `source` | `'catalog'` today; future `'listing'` / `'graded_sold'` |
  | `observed_on` | UTC date; **unique** on `(tcgplayer_id, condition, source, observed_on)` so a same-day re-run upserts instead of duplicating |
  | `observed_at` | full timestamp |

- **Write wired into `/api/sync-watchlist`** (the daily catalog price
  refresh — `/api/refresh-catalog` only recomputes the `catalog_snapshot`
  aggregate, it doesn't touch per-card prices). Both sync paths
  (`syncViaExport`, `syncViaSetCrawl`) collect a record per priced card
  and `logPriceHistory()` upserts them in `UPSERT_CHUNK_SIZE` batches,
  deduped to one row per `tcgplayer_id` per run. **Best-effort**: any
  failure is returned as `priceHistoryError` and never throws, so the
  core sync can't be broken or slowed by it.
- **Collection start date: 2026-08-28.**
- **Verified** — `sync-watchlist?maxSets=3` returned
  `priceHistoryRows: 3`, `priceHistoryError: null`, completed in 3.4 s
  (not slowed); direct query confirmed 3 well-formed rows, **0
  duplicates, 0 malformed / non-positive**. Idempotency confirmed by the
  unique index + in-batch dedupe.
- **Data-quality note for the future movers query:** `price_history`
  records exactly what the catalog holds (`source: 'catalog'`), including
  the occasional round-number placeholder (e.g. a `$1000.00`
  `last_known_price`). A movers page should filter obvious round-number
  outliers at read time once there's enough history to judge — not at
  write time, where we can't yet tell a placeholder from a real $1,000
  chase card.
- **No user-facing page.** Pure collection.

## Phase 12C — public truth, claims & statistics consistency — 2026-09-03

Site-wide audit of public factual claims. **Most of the site was already
accurate** — `/methodology` and `/how-it-works` already describe the
catalogue-backed architecture, distinguish "last seen" from "verified",
and use "market reference" (never "average"/"median"); `/cards`, `/sets`,
`/about`, `/market-data/most-listed-cards` copy is current. Four confirmed
issues, all fixed with wording changes (no data/query change, no new
helper needed):

1. **"sellers" over-claim** (eBay data gives no unique-seller id) — the
   card-hub active-**listing** count was labelled "sellers" in 3 places:
   `DealCard` footer badge (site-wide), the homepage "Most sellers
   competing" section title, and its card badge. → all now
   "N listing(s)" / "Cards with the most active listings".
2. **"Popular now:"** in `HeroSearch` — the list is the top card hubs by
   current active-listing count, not a behavioural popularity signal. →
   "**Most listed:**".
3. **Homepage browse tiles** still described `/sets` and `/pokemon` as
   deal-only ("Every set with an active below-market deal…"). → now
   "Set checklists with market-reference prices…" / "Card prices and
   values for a species…".
4. **`/pokemon/[slug]` set count** — the header said "*N cards · N sets*"
   pairing the **catalogue** card count with the **deal-bearing** set
   count (`resolved.setCount`), so "79 cards · 13 sets" contradicted the
   quick-answers "79 records across 51 sets". → header + quick-answers
   both now use `priceSnapshot.setCount` (catalogue) and label it
   "**catalogue set(s)**"; the live-listing count stays its own clause
   (`resolved.count`).

Also: `/pokemon` index metadata reworded to mention prices/values, not
just deals.

**Not changed** (audited, correct): methodology publication rules,
freshness terminology, market-reference language, set-page counts,
authenticity language (no "guaranteed authentic" anywhere), structured
data (Product/Offer = live listings only; no seller count; no graded
price), `most-listed-cards` (already disclaims "not distinct sellers").

**Terminology contract** (documented in the report + enforced by tests):
`card` = `card_catalog` row; `listing` = active `deals` row; **never**
infer `seller` count from listing count; `catalogue set` vs `set with
live deals` are distinct and separately labelled; `market reference` =
one provider recent-sold estimate (not an average/median we compute).

**Tests:** `tests/scanner/claims-consistency.test.mjs` (12) — source-level
guards against every regression above + no-new-route. `test:scanner` 544
+ `test:seo` 331 green; `npm run build` clean.

## Phase 12B — graded price integrity & confidence — 2026-09-03

**Audit** (179 cards, 1,823 graded tiers, live PPT `includeEbay`): provider
graded data is **not public-display quality by default** — 79% of tiers
provider-flagged low-confidence, **median 2 sales/tier**, 39% single-sale,
**44% priced BELOW raw NM** (incl. 109 PSA/BGS/CGC 9-10 tiers, impossible
for one printing), order-of-magnitude blends on shared-identity cards
(Fossil Shellder "PSA 10 $152" on 39 sales for a $0.45 raw card). PPT's
per-grade eBay buckets are keyed on **name + collector number only** — no
printing/edition/language field.

**`lib/gradedConfidence.js` (NEW) — `gradedTierConfidence(tier, ctx)`**
→ `{ level: "high" | "limited" | "low", reasons }`. Deterministic,
server-side, currency-invariant (ratios + counts). Never fabricates,
interpolates, forces a ladder, or invents a value — it only decides
show / show-with-a-note / suppress. A tier is **`low` (suppressed)** if
any of: unrecognized grader (only PSA/BGS/CGC/SGC kept); the set/name is a
**shared-printing identity** (11 WOTC dual-printing sets + Base Set 2,
Legendary Collection, Evolutions, Celebrations, promo/prerelease/staff/
winner name-reuse) — provider can't resolve the printing → fail closed;
`< 3` real sales; provider low-confidence; last sale `> 365d`; internal
low→high spread `> 8×`; a **9/9.5/10 tier priced below raw NM**; or an
**extreme price (`> 40× raw`) on a thin sample (`≤ 5`) with no sibling
tier within 3×**. Passes all → `high` (`≥ 8` sales) or `limited` (3-7).
**Magnitude alone never suppresses** (§16): a 30× PSA 10 with 36 real
sales on a clean printing is kept (Radiant Collection Charizard).

**Wiring:**
- `getFullPriceAnalysis` — after `coherentGradedTiers`, scores each tier
  and drops `level:"low"`; returns `gradedSuppressedCount`. Survivors
  carry `confidence` + `confidenceReasons`.
- `getGradedPrice` (scanner reference for graded deals) — same gate;
  **returns `null` for a `low` bucket** → the scanner doesn't publish
  that deal. A PSA 9 listing is still priced against the `psa9` bucket
  only (`gradeKey(grader, grade)` — unchanged), never PSA 10 / a
  different grader.
- `CardPriceSummary` — "Limited recent sales" note on `limited` tiers;
  "Other graded tiers didn't have enough reliable recent sales for this
  exact printing to show a price" when `gradedSuppressedCount > 0`;
  "No graded tier has enough reliable recent sales…" when all suppressed.
- `VariantPriceGrid` — `limited` tiles show "limited data".

**Untouched:** raw NM price, Phase 11B history, Phase 11C trend/anomaly
logic, condition ladders, deal-detection, currency (Phase 12A), Product
JSON-LD (`offers` = live listings only, never a graded price), routes,
sitemap.

**Second source:** **not needed for classification** — weak/incoherent
data can be identified internally. A second provider would improve
*coverage* (actually pricing the hidden shared-identity printings), not
the trust decision. Optional narrowly-scoped 12B.1 provider-QA experiment
recommended; **no purchase**.

**Data-quality baseline** (for future regression monitoring): of graded
cards, ~44% keep ≥1 tier; ~12% of raw provider tiers pass. Suppression
reasons (audit sample): provider-low 1438, insufficient-sales 979,
printing-identity 584, unrecognized-grader 229, 9-10-below-raw 141,
wide-spread 52, extreme-outlier 12, stale 4.

**Tests:** `tests/scanner/graded-confidence.test.mjs` (21). `test:scanner`
531 + `test:seo` 331 green; `npm run build` clean.

## Phase 12A — currency & financial-display integrity — 2026-09-03

Audit + hardening of every monetary comparison. **The Phase 6A
architecture is sound** — the hydrating UI (`refInListingCurrency` +
`<Price>`) already renders every listing↔reference↔savings block in one
currency on SSR and localises them together on hydration, and trend %s
are currency-invariant. One class of defect confirmed and fixed.

- **Root cause:** `deal.total_price` is an untyped **native-currency**
  number. Six *region-agnostic string builders* prefixed it with a
  literal `$` and put it next to the **USD** `deal.market_price` —
  rendering e.g. a CAD listing as `"$685"` beside a `"$558"` USD market
  price (a mixed, sometimes self-contradictory `<meta>` / OG / Twitter /
  search snippet, and Web-Share / alert-email text).

- **Fix:** new `dealTotalUsd(deal)` in `lib/money.js` → the USD-canonical
  asking price (`total_price_usd`, or `total_price` only when the listing
  is USD, else `null`). All region-agnostic strings now use it with `$`
  so **both** figures in the sentence are genuinely USD; the "for $X"
  clause is dropped when the USD total is unknown rather than guessed.
  - `app/deals/[id]/page.js` — meta `description` (→ OG + Twitter) and
    `ShareButton` text
  - `app/sealed-deals/[id]/page.js` — same two
  - `components/SealedDealCard.js` — `ShareButton` text
  - `app/api/check-alerts/route.js` — alert email now shows the native
    price with its **own** symbol (`symbolFor(currencyForDeal(cheapest))`),
    matching `send-digest`'s existing correct pattern; alert *matching*
    logic untouched
  - `app/cards/[slug]/page.js` — `PriceAlertForm suggestedPrice` aligned
    to the USD value (was native), matching `/deals/[id]`

- **Not changed** (verified correct): `DealCard`, `deals/[id]` visible
  price block, `CardPriceSummary`, `CardPriceIntelligence`,
  `VariantPriceGrid`, `PriceHistoryChart`, `RecentSales`,
  `SearchClient`, `CardMemoryStrip`, `CatalogueBrowser`, `SpeciesCard`,
  set/species summaries, `send-digest`. No new route, no sitemap change,
  no `hreflang`, no regional URLs, canonical stays bare. No affiliate /
  EPN / TCGPlayer link change.

### Closeout — alert-target currency contract — 2026-09-03

`price_alerts.target_price` was a **unitless** `numeric`; the cron
compared it against a listing's **native** `total_price` (whichever of
the 6 marketplace currencies had the cheapest listing that run) — an
undefined-unit comparison that could trigger / miss alerts on non-US
markets.

- **Contract:** thresholds are **USD**. `evaluateAlert()`
  (`lib/alertMatch.js`, pure): `listingTotalUsd(cheapest) <=
  target_price_usd` (USD total **incl. shipping**); no target →
  `discount_pct >= 0.10` (a %, currency-free).
- **Form / API:** the target input now shows `$ … USD` explicitly
  (`aria-label`, helper text); `/api/alerts` stores the entered number
  **directly** as `target_price_usd` — **no FX at entry, no conversion**,
  so there is no FX failure mode.
- **Migration — `supabase/price_alerts_usd_migration.sql` (MUST be
  applied; feature is live in prod).** One nullable column
  `target_price_usd` + comments. Non-destructive. **Until applied, new
  alert creation fails** (`/api/alerts` → `db_error`); the cron and
  existing alerts are safe (`check-alerts` uses `select("*")`).
- **Legacy rows (audit: exactly 1 — `kabutops-9-fossil`, `target 12`,
  confirmed):** unprovable unit → **fail closed**. A row with
  `target_price` set and `target_price_usd` null is **dormant** — the
  cron skips it (no email, no fall-through to "any below-market") until
  the subscriber re-submits the form. No threshold reinterpreted, no
  notification state touched, so no mass-retrigger.
- **Email:** targeted alert → `Current price: $X USD · Your target: $Y
  USD` (single currency); untargeted → native symbol + `%` (matches
  `send-digest`). Dedup (`last_notified_deal_id` + 20 h cooldown)
  unchanged. No affiliate/EPN change.
- **Tests:** `tests/scanner/alert-currency.test.mjs` (21) — six-market
  matrix, exact boundary, shipping, legacy dormancy + revival, FX-safe,
  fail-closed, email/dedup/affiliate guards. `test:scanner` 510 +
  `test:seo` 331 green; build clean.

## Phase 11C — card price intelligence + decision confidence — 2026-09-03

Turns the Phase 11B history foundation into the first customer-facing
market-intelligence layer, on **`/cards/[slug]` only**. No new routes, no
movers, no charts elsewhere, no redesign.

- **`components/CardPriceIntelligence.js` (NEW)** — one compact panel
  below `CardPriceSummary`: current market value, real 7/30/90/365-day
  change chips (a window is rendered **only** when `trendWindows()`
  returned non-null for it — no `0%` / `N/A` filler), one deterministic
  market status, a "current value is X% above/below its level around N
  days ago" line, and — when a genuine `isDisplayableDeal`-gated listing
  sits below the reference — how far below. Coverage phrasing
  ("Price history since January 2025." / "Price tracking recently
  started.") is derived from the card's own series. No buy/sell/
  undervalued/prediction language.

- **Market-signal rule (documented, audited).** Basis: the **30-day
  window only**. Audited over a ~1,100-card sample of the backfill:
  `|30d change|` < 5% for ~55% of cards, ≥ +5% for ~31%, ≤ −5% for ~14%.
  Rule: `Rising` ≥ +5%, `Falling` ≤ −5%, `Stable` in between,
  **`Limited history`** when the 30-day window is null (never a 7-day
  fallback). `MARKET_SIGNAL_BAND_PCT = 5` in `lib/priceHistory.js`.

- **Canonical source, zero page-time provider cost.**
  `lib/deals.js` → new `fetchCardPriceHistory(tcgplayerId)`
  (`unstable_cache`, 900 s) reads the merged spine via
  `getCanonicalPriceHistory(supabaseAdmin(), …)` — **no PPT history call,
  no eBay call**. Server-side admin read (public reference data;
  `price_history` keeps RLS on with no anon policy; the read only ever
  runs inside an ISR/cached server render). Trends/signal/coverage
  computed from the full series;
  only a **≤180-point downsampled** set (`downsampleSeries`, first + last
  always kept) is returned for the chart, to bound the RSC payload.
  `getFullPriceAnalysis` gained `{ includeHistory }` (default `true`,
  unchanged for `/deals/[id]`); the card page passes `false`, dropping
  ~1 provider credit per uncached render and removing the last
  history-endpoint dependency from card-page traffic.

- **Chart reuse.** The existing `PriceHistoryChart` (client SVG, no
  external calls) now takes the canonical downsampled points on both the
  live-hub and catalogue render paths. `VariantPriceGrid`'s raw
  sparkline + min/max now come from the same canonical points.

- **WOTC.** Canonical series for the 11 dual-printing sets is
  first-party (`catalog`) only by construction (the backfill wrote zero
  `ppt_backfill` rows for them). Short history → "Limited history" /
  "recently started", never a wrong long history. Regression-covered.

- **New helpers in `lib/priceHistory.js`:** `marketSignal(trends, confidence)`,
  `historyCoverage(series)`, `downsampleSeries(series, maxPoints)`,
  `MARKET_SIGNAL_BAND_PCT`, and (closeout) `confidentTrendWindows`,
  `endpointAnomaly`, `sourceDisagreement`, `comparePointAnomaly`,
  `TREND_CONFIDENCE`.

- **Trend anomaly-confidence gate (closeout, 2026-09-03).** A single bad
  observation, or a card whose two sources disagree, must not produce a
  public Rising/Falling badge or a misleading %. `confidentTrendWindows`
  applies three LOCAL corroboration checks over real stored observations
  and only ever **removes** a window — it never edits, smooths,
  interpolates, or substitutes a price; canonical `price_history` is
  untouched.
  - **(A) endpoint anomaly** — the latest observation is ≥ 1.5× off the
    median of the priors within 14 days and no recent prior is within
    15% of it (a genuine ramp leaves a close recent prior). Needs ≥ 3
    priors, so thin/WOTC series are never flagged. → all windows withheld.
  - **(B) source disagreement** — some day carries both a `catalog` and a
    `ppt_backfill` observation differing by ≥ 25%. Audit: on shared days
    the two sources are within 5% for 94% of pairs / within 10% for 96%,
    and ≥ 25% for only ~3% (≈97th percentile), so that gap means we
    should not publish a trend % for the card. ~4% of cards; withholding
    is the safe outcome and self-resolves as first-party history accrues
    past each window. → all windows withheld.
  - **(C) comparison-point anomaly** — a window's ~N-days-ago point is an
    isolated outlier vs both immediate neighbours (which agree). Rare
    with dense daily data (~0 in audit) but cheap insurance. → that
    window withheld.
  - When withheld, `marketSignal` stays **"Limited history"** (never a
    7-day fallback) with a `reason` so the panel can show a matching
    one-liner ("Recent price readings for this card disagree — trend on
    hold." / "A recent price reading looks unusual…"). Current market
    value (independent PPT provenance, already guarded by
    `catalogRawMarketPrice`) is still shown.
  - Suppression rate on a ~400-card sample: **~3.5% of cards** (13
    source-disagreement + 1 endpoint per 400); genuine sharp moves
    (e.g. −94% over 30 days where both sources agree on today's price)
    are **kept**.

- **No migration.** The read uses the existing server-side admin client;
  no schema, RLS, or policy change. If the panel ever gets no history for
  a card it degrades gracefully (current value + "More price history is
  being collected.", no chart).

- **SEO / schema untouched.** No new route, no sitemap change, metadata
  templates unchanged (no trend % in titles/descriptions). Product/Offer
  JSON-LD still describes only live offers. No Dataset / FinancialProduct
  schema.

- **Tests:** `tests/scanner/card-price-intelligence.test.mjs` (20).
  `test:scanner` 454 + `test:seo` 331 green; `npm run build` clean.

## Phase 11B — hybrid historical price foundation — 2026-09-02

Data infrastructure only (no public pages, no charts, no movers). Turns
the existing forward-only `price_history` collection into a **hybrid**
series: a one-time PokemonPriceTracker Business raw-history **prefix** +
the permanent first-party daily-snapshot **forward** history.

- **Schema extension — `supabase/price_history_hybrid_migration.sql`
  (NOT yet applied — owner runs it in the SQL Editor).** Non-destructive:
  two nullable columns + one index on the existing table, no data
  rewrite.

  | column | notes |
  | --- | --- |
  | `source_observed_at` | `timestamptz`, provenance — the provider's own point timestamp for a `ppt_backfill` row (distinct from `observed_at`, our ingest time) |
  | `card_number` | denormalised, parity with the first-party snapshot writer |

  The existing unique key `(tcgplayer_id, condition, source, observed_on)`
  already keeps a `ppt_backfill` point and a `catalog` snapshot for the
  **same card + day** as two distinct rows — provenance is never blurred.

- **`source` values now in use:** `'catalog'` = first-party daily
  snapshot of the printing-corrected `card_catalog.market_price`;
  `'ppt_backfill'` = one-time import of PPT Business raw Near Mint daily
  market-reference history.

- **Forward snapshot expanded — `app/api/sync-card-catalog/route.js`.**
  After the daily free `/export` refresh + WOTC second pass, a new
  `snapshotCatalogHistory()` reads `card_catalog` **back from the DB**
  (so WOTC printing fixes are included) and upserts today's price for the
  **whole priced English catalogue** (~24.5k cards) into `price_history`
  as `source='catalog'`. Zero extra PPT credits, zero eBay calls,
  idempotent per day, best-effort (`priceHistorySnapshotError` in the
  response, never throws). The `?limit=` test pass skips it. This
  supersedes the narrower `sync-watchlist` writer (which still runs and
  writes an idempotent subset — same key, harmless).

- **One-time backfill — `scripts/ppt-history-backfill.mjs`
  (`npm run history:backfill`).** Bounded, resumable
  (`.secrets/ppt-history-cursor.json`), idempotent.
  `--dry-run` / `--limit N` / `--resume` / `--credit-budget N` /
  `--cohort watchlist|deals|catalog`. Default cohort = priced English
  watchlist minus the 11 WOTC dual-printing sets ≈ **4,449 cards × 2
  credits ≈ 8,900 PPT credits** one-time. Pulls `GET /cards?...
  &includeHistory=true&days=730` (NOT `maxDataPoints` — verified to cost
  3 credits and return identical data). Per point: `isValidHistoryPrice`
  rejects sentinels / non-positive / non-finite; malformed dates
  rejected; `source='ppt_backfill'`. `preflightSchema()` aborts before
  spending a single credit if the migration is unapplied.
  **DO NOT run the full backfill without owner approval.**

- **WOTC exclusion.** The 11 dual-printing sets
  (`WOTC_DUAL_PRINTING_SETS`, exported from `lib/pokemonPriceTracker.js`)
  are excluded from the PPT backfill — PPT's `priceHistory.conditions`
  for them is a 1st-Ed/Unlimited **blend**. Their history grows from the
  clean first-party catalogue snapshots only (`card_catalog.market_price`
  is already printing-corrected for these).

- **Merge read path — `lib/priceHistory.js` (`getCanonicalPriceHistory`,
  `mergeHistoryRows`).** One canonical point per calendar day, oldest →
  newest, sentinels dropped, **first-party (`catalog`) wins a same-day
  conflict**, bounded to the newest `maxPoints` (default 800). Pure,
  fully unit-tested. **Not wired to any public page.**

- **Trend windows — `trendOverWindow` / `trendWindows`.** 7d / 30d / 90d
  / 365d, each with a tolerance (±2 / ±5 / ±10 / ±21 days). Returns
  `null` when there is no real observation within tolerance of the
  comparison date — no forward-fill, no interpolation, no fabricated
  continuity.

- **Max real depth verified:** PPT Business raw history goes back
  ~19 months (oldest ≈ 2025-01-27 for Base Set Charizard) regardless of
  `days` / `maxDataPoints`. "Unlimited history window" removes the
  *retrieval* ceiling, not a real storage depth. ~350 real points max
  per card.

- **Storage:** ~350 B/row. Full-catalogue forward series ≈ 3 GB/yr
  (~$1/mo incremental on Supabase Pro at the 5-year mark). A
  daily→weekly thinning policy after 90 days is a documented future
  option, not implemented.

- **Graded / PSA / CGC / BGS history, eBay sold-list history,
  population, velocity** → documented as **Phase 11C / 11D**, deliberately
  NOT in this raw canonical spine.

- **Tests:** `tests/scanner/price-history.test.mjs` — 18 tests covering
  the 20 §18 assertions (real observations only, sentinel/invalid
  rejection, WOTC exclusion + WOTC first-party coverage, idempotency,
  merge chronology, first-party-wins, per-window trend sufficiency, no
  graded/eBay-Browse usage, no public route / sitemap change / dataset,
  server-side credentials). Full `test:scanner` (434) + `test:seo` (331)
  green; `npm run build` clean.

- **Tiny validation run:** `--dry-run` (0 credits) confirmed the 4,449
  cohort + ~8,900 credit estimate. `--limit 3` (~6 credits) confirmed
  cohort build, WOTC exclusion, PPT fetch + parse (839 real Near Mint
  points across 3 cards, 0 sentinel, 0 invalid); the upsert failed
  closed on the absent columns (migration pending) — `preflightSchema()`
  was added afterwards so the next run aborts before spending credits.
  Cursor left clean (`doneIds: []`).

### Workstream B — UX / conversion close-out — DONE

The original UX/psychology audit document was not recoverable. P0 was
already implemented in prior commits (`31ff5a3` "UX/conversion audit P0:
homepage rebuild, DealCard redesign, sort, breadcrumbs, sticky CTA",
`9f32d09`, `90013da`). A fresh live re-check against the four focus
areas — product-card hierarchy, homepage hierarchy, trust signals,
choice architecture — found all four already in good shape; that
re-check stands as the record in place of the missing audit. No P1/P2
backlog was reconstructed (out of scope per the brief).

**Three targeted fixes implemented:**

1. **Card-page header CTA** (`components/CardPriceSummary.js`,
   `app/cards/[slug]/page.js`) — the "Price & value" summary's live-
   listings line now carries a primary button, **"View all N listings
   from $X →"** (or "View the listing …" when N = 1), an in-page anchor
   to the `#listings` deal grid (`scroll-mt-24` so the sticky header
   doesn't cover it). A price-intent visitor can act without scrolling
   past the value context. In-page anchor rather than a direct affiliate
   link because the copy promises a list to compare, not one pre-picked
   listing — every onward click from the grid is still affiliate-tracked.
   Only renders when there's ≥ 1 active listing.
2. **Currency hydration flash** (`components/CurrencyProvider.js`) — was:
   for ~0.5 s a returning viewer saw a native listing price next to USD
   "typical" / "Save" figures until the `/api/rates` round-trip resolved
   and `<Price>` swapped them. Now the last successful `/api/rates`
   response is cached in `localStorage` (`pdf_rates_v1`, 24 h max age)
   and used to **prime the store synchronously** via
   `useSyncExternalStore` — SSR and the hydration render still use the
   null baseline (a crawler still indexes the real listing currency,
   unchanged), and the cached value is applied in the same commit as
   hydration, *before paint*, not after a network wait. `/api/rates`
   still runs on mount to refresh stale rates / correct the geo currency.
   A first-ever visitor is unchanged (native, then convert once the
   fetch lands). Server-side resolution from a cookie/geo header was
   rejected: it's a request-time API, which would force `/cards`,
   `/deals`, `/sets`, `/pokemon` back to `no-store` and undo the caching
   win.
3. **"Low confidence" graded label** (`components/CardPriceSummary.js`) —
   `isLowConfidence` is PPT's price-outlier / wide-spread flag, unrelated
   to sale count, but it rendered as "· low confidence" appended to
   "20 sales", which read as a contradiction. Now its own amber line
   under the row: **"Price outlier — treat with caution"**.
   `VariantPriceGrid`'s deep-dive tiles keep their existing "low
   confidence" wording — there it sits directly under the price with a
   sparkline + sale count for context, so it isn't ambiguous.

**Bounded final pass (four lenses) — one finding, fixed:**

- **Contaminated graded tiers in the "Price & value" summary.**
  `/cards/charizard-base-set` showed a "TAG 8.5" tier at **$25.50**
  against an **$855.52** raw Near Mint value — a mislabelled-lot / altered-
  card sample surfacing under a real grade string, making the graded
  ladder look broken. The raw condition ladder already guards against
  this (stops at the first non-monotonic row); the graded list had no
  equivalent. **Fix:** drop any graded tier priced **below the raw Near
  Mint market value** (a slab costs money to grade and carries a premium,
  so a "sold below raw" tier is a contaminated sample). Kept when there's
  no raw reference to check against. Same trade-off the raw ladder makes.
  Verified live-data locally: charizard-base-set graded tiers went from
  `PSA 10 / CGC 10 / PSA 8.5 / PSA 9 / TAG 8.5` to
  `PSA 10 / CGC 10 / PSA 8.5 / PSA 9 / PSA 8`.
  The `VariantPriceGrid` "Every variant, side by side" grid lower down
  still lists every tier (incl. low grades) — deliberate: it's the
  exhaustive deep-dive view, each tile has a sparkline + sale count that
  exposes an odd data point better than hiding it would.

Nothing else in the four lenses stood out as clearly broken or clearly
high-value. The summariser-flagged "currency inconsistency" on
`/sets/[slug]` (per-listing native currencies in the no-JS view) is the
documented crawler-facing baseline, addressed for real viewers by fix 2;
"Just found" badges and "8,781 live deals" / auction end times are real
recency/inventory data, not fake urgency.

**Verification:** `tests/seo` 40/40, `tests/scanner` 5/5, `npm run
build` clean, `/cards/[slug]` still SSG (`●`). Card-page `<title>`,
self-referencing canonical, `Product` + `BreadcrumbList` JSON-LD,
affiliate `rel`/params all unchanged. Full write-up in
**`docs/ux-implementation-report.md`**.

## Fake-discount fix: raw played/damaged cards priced as Near Mint — 2026-08-29

**Symptom (user report):** listings for visibly played or damaged raw
cards showing a big "% below market" because they were priced against the
**Near Mint** reference. `detectListingCondition` only reads the listing
**title**, so any seller who didn't write "LP"/"MP"/"Dmg" there had their
card priced as NM.

**Why the title is the only free signal:** probed the eBay Browse API
live — raw singles all come back as a flat `condition: "Ungraded" /
conditionId 4000` in search results regardless of wear. The real
`conditionDescriptors` → **"Card Condition"** field ("Near mint or
better" / "Lightly played (Excellent)" / … / "Damaged") is only in the
single-item `getItem` endpoint — the same call `getGradingDetails`
already spends selectively for graded cards.

**Fix (`lib/ebay.js`, `lib/dealMatching.js`, `app/api/refresh-deals/route.js`):**
- `getRawCardCondition(listingId, marketplaceId)` — one `getItem`, maps
  the "Card Condition" descriptor to a `CONDITION_TIERS` string (or `null`
  when eBay states none). `cardConditionToTier()` unit-tested.
- `worseCondition(a, b)` — reconciles title guess vs eBay descriptor to
  the more-worn tier; ignores unknowns rather than treating them as NM.
- `resolveRawCondition()` in the scan route: a raw listing with **no
  title condition signal** whose apparent discount is **≥ 45 %**
  (`SUSPICIOUS_RAW_DISCOUNT_PCT`) gets one `getItem` to check real wear
  before publishing. If eBay says worse than NM → re-price against that
  tier via `selectConditionPrice` and re-apply the discount / sanity-floor
  gates (usually the card then has *no* priceable worse tier in PPT data,
  so it's dropped — correctly). Below 45 %, a missing signal is still
  taken as NM (a 30 %-under NM card is plausible).
- **Budget:** `getItem` is the scarce resource (shared ~5 000/day Browse
  quota — see `EXTENDED_CHUNKS`). Capped like `GRADED_LOOKUP_CAP`: 2 per
  per-card scan, 8 per sweep, memoised per listing id. Listings are
  processed cheapest-first so the budget lands on the most suspicious.
  When the budget is spent, a still-unverified suspect is **held** (not
  published) that cycle, never shown on a guess.
- Known limit: a title that *understates* wear ("LP" on an actually-HP
  card) is still trusted — closing that would mean a `getItem` on every
  played listing, not just the no-signal ones.

**Retroactive cleanup — `scripts/verifyRawConditionDeals.js`** (dry-run
by default, `--apply`, `--limit N`). Re-checks active raw deals that are
≥ 45 % off with no recorded wear against eBay's Card Condition, then
re-prices or retires.

**Run 2026-08-28 → 08-29 (manual batches + an overnight quota-gated
sweep):** ~2,369 initial suspects → **~1,440 retired + ~28 repriced**.
The played-card hit rate fell from ~73 % in the first batch to ~4 % by
the last — the fakes are essentially exhausted. Active deal count
~8,780 → **~7,520** (≈ 14 % cull, all fake or corrected). ~930 raw
"suspects" remain (≥ 45 % off, no recorded wear) but at the ~4 % tail
hit-rate these are overwhelmingly genuine NM steals or listings eBay's
descriptor confirms as NM; further passes are low-yield and not worth the
Browse quota. Re-run `--apply` any time to chip at the remainder.

Also fixed from a live report (Turtwig 103/130 League promo, every raw
listing shown 54–72 % "below" the $25.86 NM price):
- `detectListingCondition` now reads a trailing **"HP" right after a
  `103/130` collector number** as Heavily Played (bare "HP" elsewhere
  stays ignored — Hit Points).
- `resolveRawCondition` also triggers eBay verification when the listing
  price is **at/below the card's Lightly Played market value**, not only
  above 45 % off — "Near Mint" a whole grade under LP isn't credible.
- That card's 11 deals → 3 (8 retired as real LP/MP/HP).

## Machine-readable identity, entity clarity & freshness — 2026-08-30

Narrowly scoped: add the missing identity / freshness layer only. No
redesign, no new data pipeline, no schema change.

### Identity

* **Organization schema added:** yes — site-wide, in the root layout
  (`app/layout.js`), so it is on every route (previously a bare
  `Organization` appeared only on the homepage's promo view).
* **Organization `@id`:** `https://pokemondealfinder.com/#organization`
* **Canonical URL:** `https://pokemondealfinder.com/`
* **`logo`:** `https://pokemondealfinder.com/icon.svg` — the real existing
  favicon mark (`app/icon.svg`), verified to serve `200 image/svg+xml`.
* **Description:** *"Pokemon Deal Finder is a free tool that scans eBay
  listings for Pokemon trading cards and identifies the ones priced below
  their market value, using real market prices and recent sold-listing
  data."* — one sentence, factual, matches `/how-it-works` and
  `/methodology`, no superlatives, no affiliation claim, no Person/founder.
* **`WebSite` entity:** also site-wide — `@id .../#website`, `publisher`
  → `{"@id": ".../#organization"}`, `SearchAction` (sitelinks search
  box). Removed the duplicate bare `WebSite`/`Organization` that the
  homepage emitted.
* **`@id` consistency:** `lib/jsonLd.js` `collectionPage()` now sets
  `isPartOf: {"@id": ".../#website"}` (was a re-declared `WebSite` copy);
  `/about`, `/contact`, and guide `Article` blocks now reference
  `{"@id": ".../#organization"}` instead of re-declaring the org.

### sameAs

No `sameAs` links were included because no verified external Pokemon Deal
Finder profiles were found. Searched the codebase, the site footer, and
`docs/` — every external link is to eBay / TCGPlayer (affiliate) or
Impact/Vercel (tooling). The footer links are all internal
(`/about`, `/how-it-works`, `/methodology`, `/guides`,
`/affiliate-disclosure`, `/contact`). No X/Twitter, GitHub, YouTube,
Facebook, Instagram, or app-store presence exists. A `sameAs` will be
added only if/when a real official profile is created.

### Freshness

* **Source of freshness timestamp:** `fetchLastScanTime({ table: "deals",
  language: "english" })` in `lib/deals.js` → `MAX(deals.last_seen_at)`
  over active English deals.
* **Exact field:** `deals.last_seen_at` (Supabase), written by
  `/api/refresh-deals` on every upsert of a still-active listing — i.e.
  the time of the most recent scan that confirmed a live deal.
* **What it represents:** the last successful deal-data refresh, not the
  page-render time.
* **How it reaches the frontend:** the homepage already `await`s
  `fetchLastScanTime` (`lastRefreshed`) and renders
  `checked {timeAgo(lastRefreshed)}` (or "refreshing automatically" past
  a 30-minute threshold), plus the `{liveCount} live deals` count.
* **How it reaches JSON-LD:** the **same** `lastRefreshed` value is put
  on a new homepage `CollectionPage` as
  `dateModified: new Date(lastRefreshed).toISOString()`. One source, two
  renderings — no separate calculation.
* **Updates automatically:** yes. `fetchLastScanTime` is
  `unstable_cache`d with `POOL_REVALIDATE_SECONDS`; the homepage is
  `revalidate = 60`. As scans write newer `last_seen_at`, both the
  visible line and `dateModified` move with it.
* **Not hardcoded:** confirmed — no literal date anywhere; no `new Date()`
  substituted for the refresh time. Verified live: the emitted
  `dateModified` was a real recent scan timestamp
  (`2026-08-29T12:31:33.575Z` on the test build), not "now".

### Dynamic Data

* **Deal count:** `fetchMarketDataSummary()` in `lib/deals.js` →
  `activeDeals = count(deals where is_active = true)` (exact count query,
  `unstable_cache`d). Homepage renders it as `{liveCount} live deals` and
  the new `CollectionPage.description` uses the same value
  ("Approximately N …"). **Not hardcoded** — no number literal; falls
  back to a count-free sentence when the query returns null.
* **Market coverage:** `MARKETPLACES` in `lib/ebay.js` —
  `EBAY_US, EBAY_GB, EBAY_AU, EBAY_CA, EBAY_DE` → United States, United
  Kingdom, Australia, Canada, Germany. Now also stated in the homepage
  hero paragraph and the `CollectionPage.description`; already stated in
  `/how-it-works` and `/methodology` prose.
* **Refresh cadence:** `vercel.json` crons (US sweep every 15 min, other
  marketplaces every ~2 h, priority set every 6 h, wider catalogue one
  slice/marketplace/day, catalogue + sealed re-synced daily). Described
  in prose on `/how-it-works` and the homepage FAQ. Not restated in
  JSON-LD (no clean schema.org property for it).

### Pages Changed

* **`/`** (`app/page.js`) — removed the duplicate bare
  `Organization`/`WebSite` (now site-wide); added a `CollectionPage`
  JSON-LD carrying `dateModified` (from `lastRefreshed`) + a description
  naming the five marketplaces and the approx deal count; added one
  plain-language hero paragraph — *"Pokemon Deal Finder scans eBay
  listings for Pokemon cards across the US, UK, Australia, Canada and
  Germany marketplaces and compares each one against its real market
  price and recent sold listings, showing only the listings that are
  meaningfully below market."* + a `/methodology` link. FAQ + "How it
  works" prose block unchanged.
* **`/how-it-works`** — **no change.** Already fully crawlable static
  prose covering: what the tool is, the eBay Browse API source, all five
  marketplaces, deal-detection thresholds, per-tier refresh cadence, data
  currency ("How current is it?"), and two `/methodology` links.
* **`/methodology`** — **no change.** Already fully crawlable static
  prose covering: both data sources, what "market price" means, the deal
  thresholds (≥10% below, >~75% excluded), matching logic, condition /
  grading handling, seller trust checks, which pages get published, and
  limitations.
* **`app/layout.js`** — added the site-wide `Organization` + `WebSite`
  JSON-LD (static constants, in `<head>`; no data fetching added).
* **`lib/jsonLd.js`, `app/about/page.js`, `app/contact/page.js`,
  `components/GuideLayout.js`** — point `isPartOf` / `publisher` /
  `author` at the shared `@id`s.
* **`tests/seo/identity.test.mjs`** — new (10 checks).

### Validation

* **JSON-LD:** extracted from `/`, `/how-it-works`, `/methodology` from a
  local `next start` (no JS). All blocks parse as valid JSON. Verified:
  `Organization` `@id`/`url`/`name`/`logo` correct, **no `sameAs`**, no
  `Person`, no `founder`, description free of superlatives; `WebSite`
  `@id` + `SearchAction` + `publisher` `@id`; homepage `CollectionPage`
  `dateModified` parses as ISO and was a real recent scan time;
  `isPartOf` `@id` matches the `WebSite`. External Rich Results Test not
  run from this environment — local structural validation only, now
  enforced by the test suite on every run.
* **Raw HTML inspection:** the homepage raw HTML contains, without JS:
  what the tool does, the five marketplaces, the live deal count, the
  "checked X ago" freshness line, and a `/methodology` link.
  `/how-it-works` and `/methodology` raw HTML contain the full prose
  described above.
* **Tests:** `npm run test:seo` — 50/50 (was 40; +10 identity checks).
  `npm run test:scanner` — pass. Build clean.
* **Production build:** `npm run build` succeeds; `/`, `/how-it-works`,
  `/methodology` render as before (`/` ISR, the other two static).

### Architectural Decisions

No significant architectural changes were required. The deal count
(`fetchMarketDataSummary`) and the refresh timestamp
(`fetchLastScanTime` → `MAX(deals.last_seen_at)`) already had single,
real, cached sources of truth that the homepage already fetched. The new
JSON-LD is either a static constant (`Organization`/`WebSite`) or reuses
an already-fetched value (`lastRefreshed`). No database, ingestion
pipeline, caching, or deal-detection change; no second source of truth
introduced.

### Explicit Non-Claims

This implementation does **not** claim or imply that structured data
guarantees Google AI Overview citations, AI-search visibility, rankings,
traffic, indexing, revenue, or any other specific outcome. It is a
machine-readability and entity-clarity improvement only.

### Note: the `?country=EBAY_XX` param that appears on `/` (client-side only)

Loading a bare `https://pokemondealfinder.com/` in a **browser** ends up
showing `…/?country=EBAY_AU` (or `EBAY_US`, etc.) in the address bar.
Traced 2026-08-30 — **this is not a server-side redirect** and does not
create a duplicate indexable URL:

* `curl -I https://pokemondealfinder.com/` (and with a Googlebot UA)
  returns **HTTP 200**, no `Location` header, `X-Matched-Path: /`.
  `curl -L` follows **0 redirects**. A non-JS crawl gets the bare URL.
* The URL change is `router.replace()` (= `history.replaceState`) inside a
  `useEffect` in `components/RegionRedirect.js` — client-side, after
  hydration. It sends a visitor with no explicit `?country=` and no
  stored region preference to their geo-detected marketplace (from
  `/api/rates` → Vercel `x-vercel-ip-country`), as a *default only* (not
  written to storage).
* **Consolidation signals, all present:** every `/?country=EBAY_XX`
  response carries `rel="canonical"` → bare `https://pokemondealfinder.com`
  (page-2+ → `/?page=N` with `country` stripped) — not self-referential;
  all in-page country filter links are `rel="nofollow"`; **zero**
  `?country=` URLs in `sitemap.xml`.
* **Not introduced by the identity/freshness work.** `RegionRedirect`'s
  auto-default-to-`?country=` behaviour dates to commit `d364ee7`
  ("Auto-detect the visitor's region (geo-IP) as the region default"),
  part of the earlier localization phase; later moved fully client-side
  in `7dba737`. The identity work did not touch region/personalisation.

Bounded URL space: 5 marketplace values × page variants, all
canonicalising home. If Search Console coverage ever shows a
`?country=…` URL indexed separately, the fix is a product/architecture
call (serve the geo default without a URL param at all) and should be
raised rather than patched ad hoc.

## `/pokemon` index: full dex, grouped by generation — 2026-08-30

The `/pokemon` index previously listed **only** species with an active
deal (`SPECIES_MIN_LISTINGS`+). Rebuilt as a browsable directory of **all
1,025 canonical species**, in National Pokedex order, grouped into the 9
generations (with region names Kanto…Paldea) and per-generation counts.

* Data: `SPECIES_WITH_GENERATION` (new export in `lib/pokemonSpecies.js`)
  — the existing `SPECIES` array (auto-generated from PokeAPI, dex order)
  tagged with dex number + generation via the fixed dex-range boundaries.
  No new dataset, no network.
* A species **links to `/pokemon/[slug]`** only when it has an active
  deal (from `fetchSpeciesHubs`, unchanged) — shown with an emerald
  listing-count badge. The other ~850 render as **plain dimmed text**
  (no link): their slug page 404s by design, so a link would be a dead
  end.
* **`/pokemon/[slug]` and its indexability are unchanged** — still exists
  and is indexable only for species that clear `SPECIES_MIN_LISTINGS`;
  still `notFound()` / `noindex` otherwise. The `/methodology` statement
  ("A Pokemon page exists only when that Pokemon has at least five active
  listings") still holds for the detail pages. The index itself is a
  content-rich hub, not thin content.
* JSON-LD: `breadcrumbList` + `collectionPage` (unchanged) + an
  `itemList` of **only the linked species** (real names, real URLs — no
  entries for the deal-less ones).
* `PokemonFilterList` now groups by generation; the client-side substring
  filter spans the whole dex. Every species + every real link is in the
  server HTML.
* Verified: 1,025 species in raw HTML (171 linked + 854 plain on the test
  build), 9 generation sections, one `<h1>`, `test:seo` 50/50, build
  clean, `/pokemon` still statically rendered.

## /pokemon rework Phase 1 — PokemonPriceTracker licensing check (2026-08-30)

Brief: before integrating more PokemonPriceTracker (PPT) data into a
public "complete Pokedex + every card per species" browsing layer,
confirm their terms permit **publicly displaying** their pricing data.

**Read:** `pokemonpricetracker.com/terms` and `/licensing` (2026-08-30).

**Finding — public display IS permitted, conditional on the Business
plan.** Confirming clauses, verbatim:

* Terms: *"You may store and cache PokePriceTracker Data in your own
  systems and serve it to the end users of your own application, on the
  plan appropriate to your use."*
* Terms: commercial use ("Building applications, websites, bots, tools,
  or services that generate revenue") *"requires an active Business or
  Enterprise subscription."*
* Licensing: *"Aggregate prices — medians, ranges, trends, your own
  derived numbers — can be displayed on any plan appropriate to your
  use."*
* Licensing: *"Caching and storing responses to serve your own
  application is expected and fine."*
* Licensing, on the Business tier: *"Advertising, affiliate links,
  subscriptions, paid features and one-off sales all count as revenue."*

**Prohibited (must stay clear of):**

* Terms: *"You may not resell, sublicense, syndicate, or redistribute the
  raw data itself as a standalone product or data service."* /
  *"Use our API to power your own competing API that sells or provides
  the same pricing data to third parties."*
* Terms: caching *"does not extend to exposing your stored copy to third
  parties, publishing it as an API or feed, or transferring the stored
  dataset to anyone else."*
* Licensing: *"a 'derived' feed that is really our dataset in a thin
  disguise is still redistribution"* / *"if someone could use your
  product instead of subscribing to us in order to get the data, that is
  not permitted."*
* Terms: data-accuracy disclaimer — *"WE DO NOT GUARANTEE ... THE RESULTS
  ... WILL BE ACCURATE OR RELIABLE."* Keep the existing "reference price
  from PokemonPriceTracker, based on recent sold data" framing; never
  present a figure as a guaranteed valuation.

**Plan tier:** the site generates affiliate revenue, so it must be on
**Business/Enterprise**. Evidence it already is: `lib/pokemonPriceTracker.js`
uses a Business-tier-only endpoint (individual eBay sold listings via
`includeEbay`), and `.env.example` already notes *"Needs their Business
tier for commercial/public use."* Recommend the account owner
double-confirms the active plan.

**Status: BLOCKED pending two owner decisions — no Phase 2+ code written.**

1. **Confirm the PPT account is on Business or Enterprise.** The *current*
   public display of PPT-derived prices (`/cards/[slug]`,
   `/methodology`, the `/pokemon/[slug]` catalogue fallback) already
   depends on this; it is not new to this rework.
2. **Scope call (business/legal judgment, not engineering):** "every card
   for every species with a PPT reference price, browsable" surfaces far
   more of PPT's catalogue than the current per-deal usage. A per-species
   card list with one reference price each reads as "aggregate prices
   displayed to end users" (permitted); a comprehensive, searchable
   all-cards-with-prices database edges toward the "substitute for
   subscribing / derived dataset" line their resale clause targets.
   Recommended conservative scope if greenlit: browse only from our own
   DB (the value-filtered `watchlist` slice `sync-watchlist` already
   maintains — keep the min-value filter, do **not** bulk-`/export` the
   full catalogue), one reference price per card, no price-history /
   per-condition / sold-comp data in the browse layer, no CSV/API/feed.

### Phases 2–5 — IMPLEMENTED (2026-08-30, owner confirmed Business plan)

**Phase 2 — data architecture.**

* New table **`card_catalog`** (`supabase/card_catalog_migration.sql` —
  owner runs it). PPT's full card catalogue synced into our own DB:
  `tcgplayer_id` (PK), `name`, `"set"`, `set_id`, `card_number`,
  `rarity`, `card_type`, `species` (= `extractSpecies(name)`, null for
  trainers/energy), `language`, `market_price` (PPT `prices.market` —
  **reference only**), `image_url`, `source = 'pokemonpricetracker'`,
  `synced_at`. The `market_price` column name + `source` value keep it
  clearly distinct from `deals` (eBay, our source of truth) and
  `watchlist` (the value-filtered slice we re-scan).
* New endpoint **`/api/sync-card-catalog`** (cron `0 2 * * *`, CRON_SECRET
  auth). One `listSetCards` request per set (219 English sets), upserts
  by `tcgplayer_id`. `?chunks=N&chunk=M` splits it for resumability;
  `?maxSets=N` for a test pass. Reports `setsScanned`, `cardsUpserted`,
  `creditsApprox`.
* **Credit estimate (Business tier = 200,000 credits/day, 500 req/min):**
  `listSetCards` bills ~1 credit per card returned. PPT's own docs put a
  full set-by-set catalogue crawl at **~29,000 credits / 219 requests**
  (≈ 14.5% of the daily budget; 219 requests is trivial against
  500/min). Cadence chosen: **once daily**. Head-room for the other PPT
  jobs (`sync-watchlist` ~a few thousand credits/day, on-demand card
  pages ~3 credits each) is ample. The `/export` endpoint (0 credits,
  2/day cap) is a future optimisation once its CSV schema is verified —
  not used now.
* **Not live-queried per page load.** Pages read `card_catalog` from our
  DB; `fetchSpeciesCatalog` is `unstable_cache`d (`CARD_HUB_REVALIDATE_
  SECONDS` = 900s). Before the first sync it degrades to the `watchlist`
  slice automatically.

**Phase 3 — `/pokemon` grid.** Collapsible generation sections (Gen 1
open, 2–9 collapsed — every species link still in the server HTML, just
`hidden`, so crawlers see all 1,025). Deal-having species get the green
tile + emerald listing-count badge; the rest are plain. Small
dex-number chip, no card art / no official branding. Every species links
(deal page, or the full-catalogue page).

**Phase 4 — `/pokemon/[slug]`.** Both variants now show **every known
card of the species** via a shared `<SpeciesCardList>`:

* deal card → green row: "N% below market · N live listings from $X",
  links to the listings (`/cards/[slug]` hub or the `#deals` grid).
* non-deal card → plain row: set · number · rarity, the PPT **reference
  price** (labelled, never as a deal or guaranteed value), and a plain
  **"View on eBay"** affiliate link. No savings %, no strikethrough, no
  green.
* Sorted deals-first, then the rest by reference price.
* Deal-having species: the deal grid stays the top section (`#deals`),
  the full card list is added below it — browsing isn't gated behind a
  deal existing. No-deal species: the card list replaces last turn's
  thin list; page stays `noindex,follow`, still not in the sitemap.

**Phase 5 — affiliate correctness.** The non-deal "View on eBay" and
per-species "Search … on eBay" links use `buildEbaySearchLink()` →
`wrapEbayAffiliateUrl()` — the same EPN params (`campid`, `mkevt`,
`rel="sponsored"`) as the existing deal CTAs. Verified in the rendered
HTML (`campid=` present on every non-deal link). No "below market" /
savings language anywhere on a non-deal card.

**Indexability unchanged.** Only species that clear
`SPECIES_MIN_LISTINGS` get an indexable `/pokemon/[slug]`; everything
else is `noindex,follow` and absent from the sitemap. `card_catalog` is
internal, rendered per page, never exported — matching PPT's terms
(cache + serve to your own end users; no feed/API/bulk redistribution).

**Owner action to finish:** run `supabase/card_catalog_migration.sql`,
then the first sync populates ~40k cards; until then the pages use the
`watchlist` fallback (~4,900 cards).

### Follow-up — "Every [Species] card" list redesign (2026-08-30)

The list shipped as a thin ~40px-thumbnail row table, out of step with
the site's DealCard grids. Visual pass only — no data / deal-detection
change.

* **`components/SpeciesCard.js`** (new) — one tile, same shell as
  `DealCard` (image-forward `aspect-square`, info + CTA below, hover
  lift). Two variants, still visibly distinct:
  * **deal** → emerald border + `−N%` badge, cheapest listing price via
    `<Price>`, "N% below market · N live listings", green **See deal →**
    (to the `/cards/[slug]` hub or the `#deals` grid).
  * **browse** → plain: the PokemonPriceTracker reference price via
    `<Price>` + "Reference price · PokemonPriceTracker" attribution, a
    neutral bordered **View on eBay →** affiliate CTA
    (`buildEbaySearchLink` → EPN params, `rel="sponsored"`). No badge, no
    green, no "below market".
* **`components/SpeciesCardList.js`** — now an image-forward grid
  (`grid-cols-2` mobile → `sm:3` → `lg:4` → `xl:5`, matching the site's
  other card grids). Active deals lead in their own labelled green
  section, then the full browse grid — a real deal is never buried among
  the browsable-only cards.
* **`next/image`** replaces the raw `<img>` — responsive `sizes`,
  optimised (WebP/AVIF) + lazy by default; `tcgplayer-cdn.tcgplayer.com`
  was already in `next.config.mjs` `remotePatterns`.
* `SpeciesCatalog` main widened `max-w-3xl` → `max-w-6xl` so the grid
  breathes.

**Core Web Vitals — checked:**
* **LCP** — unaffected. The card grid sits below the fold on both page
  variants (after the hero on the no-deal page, after the whole
  `<DealGrid>` on the deal page); `next/image` without `priority` is
  `loading="lazy"`, so these images don't enter the LCP path. Source
  images are already small (`_in_200x200.jpg`) and Next serves
  per-breakpoint variants.
* **CLS** — none introduced. Every tile image is `<Image fill>` inside a
  fixed `aspect-square` container, so space is reserved before load —
  the same pattern `DealCard` uses.
* Verified `grid-cols-2` on mobile width (the layout's original
  complaint), `xl:grid-cols-5` on desktop; deal tiles green with the
  badge, browse tiles plain with reference price + working EPN "View on
  eBay".

`tests/seo` 49/50 (the one failure is the pre-existing, unrelated
homepage→`/sets/<thin-set>` `DealCard` broken-link that flakes with the
deal rotation — a `DealCard` set-link guard, not this pass),
`tests/scanner` 11/11, production build clean.

## Fix: set-name links to non-existent /sets/[slug] pages — 2026-08-30

`DealCard` (and several sibling components) linked a card's set name to
`/sets/<slug>` **unconditionally**. When a set drops below
`SET_MIN_LISTINGS` its page stops existing (`/sets/[slug]` → 404 by
design), but the components didn't know — so the homepage carried a
broken internal link. This tripped `tests/seo` intermittently across
multiple sessions (data-dependent: a different thin set each time — last
seen `sv01-scarlet-violet-base-set`, before that `sm-crimson-invasion`).

### Source of truth

`lib/deals.js` `fetchSetSlugs(language)` — the `SET_MIN_LISTINGS`-filtered
slug list, derived from the **same** `fetchSets()` /
`computeAggregates()` the page's own existence check uses (no second
threshold implementation). Returned as a plain array so client
components can take it as a prop.

### Every place a set name was shown as a link — now gated

| Location | Fix |
| --- | --- |
| `components/DealCard.js` | new `validSetSlugs` prop; set is a `<Link>` only if `validSetSlugs.includes(setSlug)`, plain text otherwise (safe default when the prop is absent) |
| `app/page.js` (5 `<DealCard>` grids) | pass `validSetSlugs` from `fetchSetSlugs()` in the page `Promise.all` |
| `app/best-finds/page.js` | same |
| `app/cards/[slug]/page.js` | `setHasPage` gate on: visible breadcrumb, `BreadcrumbList` JSON-LD `item`, the header set link, the "All &lt;set&gt; deals →" link, and the featured `<DealCard>` |
| `app/deals/[id]/page.js` | `setSlug` is now `null` unless in the valid list → existing `setSlug ? <Link> : text` already handles it |
| `app/market-data/most-expensive-cards/page.js` | `<Link>` vs `<span>` gate per row |
| `components/DealGrid.js` → `app/pokemon/[slug]`, `app/sets/[slug]` | `validSetSlugs` prop threaded to its `<DealCard>`s (`sets/[slug]` passes `[slug]` — its own page exists) |
| `app/pokemon/[slug]/page.js` | `ItemList` JSON-LD fallback URL: hub → set page (if it exists) → this species page, never a 404 `/sets/` |
| `app/search/SearchClient.js` | `validSetSlugs` prop from the (now `async`) `app/search/page.js` |
| `app/japanese-cards/page.js` | unaffected — `DealCard` already nulls the set link for Japanese cards |

### Sitemap — re-confirmed

`lib/sitemap.js` `case "sets"` already maps over `fetchSets()`, so
sub-threshold sets were never in `sitemap.xml`. No change needed.

### Verification

* Real current case: `/sets/swsh11-lost-origin` (2 active deals, below
  the threshold) returns **404**; `/deals/22256` (a card in that set)
  now renders "SWSH11: Lost Origin" as **plain text**, no `href`; every
  `/sets/` link on the live homepage resolves **200**.
* `npm run test:seo` — **50/50 across 3 consecutive runs** (previously
  intermittent on this exact assertion). `npm run test:scanner` 11/11.
* `npm run build` — clean.

## Card data completeness: missing cards + "$0.00" prices — 2026-08-30

### Part A — missing cards on species pages

**Root cause (named): the `card_catalog` sync had not finished — ~133 of
219 sets synced.** *Not* a pagination bug and *not* a species-matching
bug:

* Pagination — `listSetCards(setId, { fetchAllInSet: true })` returns
  every card of a set in one request. Verified on Skyridge: PPT returns
  182, `card_catalog` has 182, **0 missing**.
* Species matching — `extractSpecies` returned null for 24 Skyridge cards,
  **all of them genuinely non-Pokémon** ("Star Piece", "Mystery Plate",
  "Mirage Stadium", …). No false negatives on real Pokémon cards.
* The actual mechanism: the per-set `listSetCards` crawl (~29,000 credits
  for a full pass) kept **429-ing on PPT's per-minute credit window** —
  each `listSetCards` pulls 200-300 cards = 200-300 credits at once — so
  each chunked run only got ~15-20 of its ~27 sets in before the rest
  failed/were skipped. The catalogue filled slowly and unevenly.

**Fix — switched `sync-card-catalog` to PPT's `/export` (printings CSV):**

* **One request, zero API credits**, the whole catalogue in a gzip CSV
  (~76k printing rows → **~29,294 distinct English cards**, vs the ~17k
  the crawl had managed).
* Per-`tcgPlayerId` merge of the printing rows; `market_price` falls back
  NM → market → LP → MP → HP → Damaged (so a card with only played-
  condition data still gets a real reference — see Part B).
* `image_url` derived as `…/product/<tcgPlayerId>_in_200x200.jpg` (the
  same URL `listSetCards` returned) — no extra call.
* `/export` is capped at **2 downloads/day**, so the cron is back to
  once-daily (`0 2 * * *`).

**Backfill status — INCOMPLETE (A4 spot-check FAILED 2026-08-30).** The
backfill run did *not* fill the catalogue. It only ever got 2 successful
`/export` downloads before PPT's **2-downloads-per-day** cap returned
`429 "Daily export limit reached"` on every subsequent call, and each of
those 2 runs was itself killed mid-upsert by Vercel's `maxDuration`
(800 s) — the full parse + `extractSpecies` ×29 k + ~58 sequential
Supabase upserts doesn't fit one invocation. `card_catalog` today is the
**leftover union of that partial `/export` work and the earlier partial
per-set crawl (83 of 219 sets)** — not a complete snapshot.

State right now: **21,175 English rows / 16,656 with a species**, across
**155 of 219 sets** — vs the export's **~29,294 distinct English cards**.
**~8 k cards (~28 %) and 64 whole sets are missing**, including **Base
Set, Neo Genesis, Crown Zenith, Silver Tempest, SWSH Black Star Promos,
Jumbo Cards, and every Trainer Gallery subset**.

### A4 — three-way coverage spot-check (`scripts/auditSpeciesCoverage.js`)

18 species across every generation. **PPT** = distinct English
`tcgPlayerId`s from the `/cards?search=` endpoint (independent of the
`/export` CSV the sync uses) run through the *same* `extractSpecies`
filter; **DB** = `card_catalog` rows for `(species, english)`; **LIVE** =
distinct card thumbnails rendered on `/pokemon/<slug>`.

| Species | Gen / era | PPT | DB | LIVE | Verdict |
| --- | --- | ---: | ---: | ---: | --- |
| Charizard | 1 — Base→SV | 207 | 90 | 90 | **FAIL** |
| Blastoise | 1 — Base, e-Card | 71 | 39 | 39 | **FAIL** |
| Alakazam | 1 — Base Set | 42 | 34 | 34 | **FAIL** |
| Dragonite | 1 — Fossil, Neo | 80 | 39 | 39 | **FAIL** |
| Feraligatr | 2 — Neo Genesis | 34 | 24 | 24 | **FAIL** |
| Espeon | 2 — Neo, Skyridge | 69 | 43 | 43 | **FAIL** |
| Umbreon | 2 — Neo, Skyridge | 72 | 46 | 46 | **FAIL** |
| Tyranitar | 2 — Neo, e-Card | 69 | 44 | 44 | **FAIL** |
| Kingdra | 2 — Aquapolis | 37 | 28 | 28 | **FAIL** |
| Rayquaza | 3 — EX-era | 87 | 55 | 55 | **FAIL** |
| Gardevoir | 3 — EX→SV | 85 | 58 | 58 | **FAIL** |
| Flygon | 3 — EX-era | 45 | 33 | 33 | **FAIL** |
| Lucario | 4 — DP/Platinum | 111 | 72 | 72 | **FAIL** |
| Garchomp | 4 — DP/Platinum | 59 | 38 | 38 | **FAIL** |
| Zoroark | 5 — B&W | 68 | 47 | 47 | **FAIL** |
| Greninja | 6 — XY | 69 | 42 | 42 | **FAIL** |
| Zacian | 8 — SWSH | 48 | 21 | 21 | **FAIL** |
| Miraidon | 9 — SV | 41 | 30 | 30 | **FAIL** |

**0 / 18 PASS.** DB runs ~43–65 % of PPT for every species, every era —
a *systemic* shortfall, not an old-set-specific one (modern Zacian 44 %,
Miraidon 73 %; vintage Alakazam 81 %). **LIVE == DB in all 18 rows**, so
the `/pokemon/<slug>` render layer is faithful — the gap is entirely
missing `card_catalog` rows.

Verified the gap is **real cards, not search-endpoint artefacts**
(`scripts/auditMissingIds.js`): of Charizard's 117 missing ids, a
direct `/cards?tcgPlayerId=` lookup on a sample returned real English
cards — "Special Delivery Charizard", "Charizard VSTAR SWSH262", "Lance's
Charizard V", Lost Origin Trainer Gallery TG03 — all in sets that have
**0 rows** in `card_catalog`. `extractSpecies` is not implicated: the
names it dropped from the search results were correctly-excluded Tag Team
duos ("Reshiram & Charizard GX"), code cards, and deck-mate energy cards.

### Fix in progress — off-Vercel full sync (2026-08-30)

- **`scripts/syncCardCatalogFull.js`** — new. Runs the `/export` sync end
  to end in one long-lived local process (service-role, no 800 s
  ceiling). Same record logic as the route. One download; **exit 2 and
  consumes nothing if the export 429s**. Chunked upsert (1000/chunk)
  logging a cumulative count; any upsert error aborts loudly with the
  partial total. Post-run: english row count vs export distinct-card
  total + duplicate-`tcgplayer_id` scan; non-zero exit if short. No more
  "done" from a clean exit that didn't finish.
- **Blocked until 2026-08-31 00:00 UTC** — verified live at 08:07 UTC
  30-Aug: `/export` → `429 {"remaining":0,"resetAt":"2026-08-31T00:00:00Z"}`.
  Both of 30-Aug's 2 calls were spent by the failed backfill.
- **Queued:** a background job waits for the reset, runs
  `syncCardCatalogFull.js` (one retry with the 2nd daily call if the
  first still 429s), then re-runs `scripts/auditSpeciesCoverage.js` and
  dumps totals to `full-sync-and-audit.log`.
- **Close criteria:** english `card_catalog` rows ≈ export distinct total
  (~29,294), 0 duplicate ids, and the 18-species audit showing DB == PPT
  (± Tag-Team / code-card noise) — real numbers in the table below, not a
  summary claim.

`test:seo` 57/57, `test:scanner` 11/11, `npm run build` clean with the
new script in the tree.

**Part A is NOT closed.** _(Post-sync audit table will be filled in here.)_

**Status 2026-08-30 20:30 UTC:** still blocked. The PPT `/export` 2/day
quota resets at `2026-08-31T00:05:00Z` — the background job
(`b1a0ui2ht`) is alive and waiting, target ~3.5 h out. `card_catalog`
unchanged at 21,175 / 16,656 with species. Running the manual fallback
now would just re-hit the 429 (verified: the reset time is future). It
fires + re-audits on its own once the quota clears.

### Part B — "$0.00" reference prices

**Root cause (named): PokemonPriceTracker returns `0` or `""` (never
null) for a card/condition it has no price data for; the sync stored the
`0`, and `<Price>` rendered a formatted currency zero** ("A$0.00" on the
reported Gengar (H9) Skyridge, `?country=EBAY_AU`). Confirmed it is *not*
a currency-conversion bug: the underlying value was genuinely `0`, and it
rendered "$0.00" in the US view too.

**Fixes:**

* **`lib/money.js` `hasPrice(n)`** = `Number.isFinite(n) && n > 0`. One
  helper, used to gate every reference-price render:
  * `SpeciesCard` — `hasPrice(refPrice)` ? `<Price>` : **"Price
    unavailable"** (matches the site's existing incomplete-data pattern,
    e.g. `VariantPriceGrid`'s "—" and `CardPriceSummary`'s
    contaminated-ladder suppression).
  * `CardPriceSummary` — `rawNm`, the raw condition ladder, and each
    graded tier now require `hasPrice`.
  * `VariantPriceGrid` — tile price (`—` when absent) and the
    min-max range line.
* **Sync** stores `null` for `market_price <= 0`, and the NM→…→Damaged
  fallback means a sparse card like Gengar (H9) (no NM price, real
  `marketLightlyPlayed` of $1,499.99) will get a real reference once the
  `/export` sync runs — instead of "unavailable".
* **Backfill applied now:** 240 existing `card_catalog` rows with
  `market_price <= 0` set to `null` (Supabase data-API `update`, not
  DDL). Verified live: `/pokemon/gengar?country=EBAY_AU` now shows
  Gengar (H9) as "Price unavailable", **0 `$0.00`/`A$0.00`** on the page
  (US view too).
* **Regression check:** `tests/seo/prices.test.mjs` — fetches a sample of
  species/card pages (incl. an AU country view and sparse vintage sets)
  and fails on any currency-symbol-adjacent `0.00`. `test:seo` **57/57**.

### Do the two issues share a cause?

**Loosely — same population of cards, different mechanisms.** Both bite
older/sparse sets (Skyridge, e-Reader): those sets synced last/not-yet
(A), and their cards come back with `0`/empty prices (B). A is a
sync-throughput/completeness problem; B is a null-handling problem. Fixed
independently; the `/export` switch happens to help both (complete
catalogue + per-condition price fallback).

### Verification

* `test:seo` 57/57 (7 new zero-price checks), `test:scanner` 11/11,
  `npm run build` clean.
* No perf regression — `/export` is a single request replacing 219;
  `fetchSpeciesCatalog` query is unchanged.
* **A4 re-check: RAN 2026-08-30 — FAILED 0/18.** `card_catalog` is still
  ~28 % short (64 sets missing, incl. Base Set). Part A is **not closed**
  — see "Backfill status — INCOMPLETE" and "A4 — three-way coverage
  spot-check" above for the table, root cause, and remediation.
* Part B (the `$0.00` display fix) is unaffected by the A4 failure and
  stands — `hasPrice()` guards + the DB backfill were verified separately.

## Set logos (pokemontcg.io) + species icons (PokéAPI) for /sets & /pokemon — 2026-08-30 — SHIPPED (commit `ff8796d`)

The earlier stop stood on PPT: its terms are silent on images and the
set-image URLs it returns (TCGplayer `set_icon/*.png`) `403` on a direct
GET. The owner then directed a different source — **pokemontcg.io** for
set logos, **PokéAPI sprites** for species icons — and cleared PokéAPI
sprites explicitly (same fair-use posture as the site's existing ~29k
hotlinked card thumbnails). Built on that basis.

### Phase 1 — pokemontcg.io images: hotlinkable, confirmed (the TCGplayer-CDN test, repeated)

pokemontcg.io is a **separate free public Pokémon TCG API**, unrelated to
PPT / TCGplayer infra. Read `pokemontcg.io` docs + `/terms` directly:
no API key required at our volume (1000 req/day, 30/min unauthenticated),
**no stated attribution requirement**, `pokemon-tcg-data` has no image
LICENSE and the SDKs are MIT.

Direct GET (same probe used on the TCGplayer CDN):

| URL | Result |
| --- | --- |
| `images.pokemontcg.io/base1/logo.png` | **200** `image/png` 437 KB |
| `images.pokemontcg.io/sv8/logo.png` | **200** `image/png` 156 KB |
| `images.scrydex.com/pokemon/<id>-logo/logo` (newest sets) | **200** `image/png` |
| — contrast — `tcgplayer-cdn.tcgplayer.com/set_icon/*.png` (PPT's URLs) | **403** |

No referer gate, real bytes. Hotlinkable.

### Phase 2 — set logos on /sets

- **`scripts/generateSetImages.js`** (one-off, committed for
  reproducibility) — fetches `api.pokemontcg.io/v2/sets` (paginate
  `pageSize=50` + up to 5 retries/page; their API 500s intermittently),
  reads our distinct English set names from `card_catalog` +
  `watchlist WHERE language='english'`, matches, writes
  `lib/setImagesData.js`.
- **Set-name matching strategy** — PPT/our set names carry era prefixes
  pokemontcg.io drops ("EX Ruby & Sapphire" → "Ruby & Sapphire", "Base
  Set" → "Base", "Scarlet & Violet 151" → "151"). Solved with
  `norm()` (strip a leading era-code token incl. em-dash separators,
  fold `&`→`and`, drop non-alphanumerics, lowercase) + a hand-built
  `ALIASES` table for the ~40 that normalise doesn't catch (promo sets,
  HS-era em-dash names, base-set renames). **Result: 161 / 207 distinct
  English set names matched (~78%).**
- **The 46 unmatched are genuine gaps** — sets pokemontcg.io doesn't
  catalogue at all: Trainer Kits, McDonald's promo sets, deck/blister
  exclusives, "e-Reader Sample Cards", "League & Championship Cards",
  "Jumbo Cards", the very newest promo sets. These fall back to the set
  name as text (no broken-image icon).
- **`lib/setImagesData.js`** — `SET_IMAGES = { "<set name>": { logo,
  symbol } }`, 161 entries. Hosts: `images.pokemontcg.io` (most) +
  `images.scrydex.com` (8 newest ME sets). Static — no runtime fetch.
- **`lib/setImages.js`** — `setImage(name) → { logo, symbol } | null`.
  Dependency-free CJS (no `next/cache`, no Supabase) so it's safe to
  reach from the client component.
- **`app/sets/page.js`** enriches each set with `logo: setImage(s.set)
  ?.logo ?? null`; **`components/SetsFilterList.js`** renders it as a
  lazy `next/image` `fill` inside a fixed `h-8 w-20` (80×32) box —
  `object-contain object-left`, `sizes="80px"`. Fixed box = no CLS.
  No logo → empty span, set name still identifies the tile.
- **`next.config.mjs`** — `images.remotePatterns` += `images.pokemontcg.io`,
  `images.scrydex.com`.

### Phase 3 — species icons on /pokemon

- **`components/PokemonFilterList.js`** — each species tile renders a
  plain lazy `<img>` (not `next/image` — 1025 of them, tiny static PNGs,
  no optimiser value) at the PokéAPI sprite:
  `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${dex}.png`.
- **URL is deterministic from the dex number** — nothing to cache or
  fetch; it's computed inline from data already on the tile.
- 28×28 fixed `width`/`height` (no CLS), `loading="lazy"`,
  `decoding="async"`, `[image-rendering:pixelated]`. `onError` hides a
  sprite that fails rather than showing a broken-image icon.
- Covers **all 1025 dex** (every sprite 1–1025 resolves 200; spot-checked
  1.png = 543 B, 1025.png = 1715 B).

### Verification (live, commit `ff8796d`)

- `/sets` — 76 `_next/image` requests for pokemontcg.io/scrydex logos,
  **all HTTP 200**, non-zero bytes, zero 4xx, zero zero-size. DOM check:
  `img.complete`, `naturalWidth > 0`, `visibility: visible`, box 80×32.
  Canvas pixel-sample of 6 logos (old base-set through SWSH) confirms
  real coloured content (opaque 28–85%, avg luminance 78–166) — not
  blank/white/broken. **134 / 154 live set tiles carry a logo**; the
  other 20 show set-name text only.
- `/pokemon` — all 1025 sprite `<img>` in the server HTML; sampled
  dex-1 sprite loads (`complete`, `naturalWidth 96`, `visibility:
  visible`, rendered 28×28). Off-screen sprites correctly deferred by
  `loading="lazy"`.
- No CWV regression: both image types are lazy, in fixed-size boxes
  (zero CLS), off the critical path; sprites are ~0.6 KB CDN PNGs.
- `test:seo` 57/57, `test:scanner` 11/11, `npm run build` clean.
- Note: the browser-automation **screenshot** tool's `captureScreenshot`
  was timing out during this check (CDP renderer flake, every tab) — so
  the verification above is DOM + network + canvas-pixel evidence rather
  than a visual capture. That evidence is conclusive: the images fetch
  200, decode, and paint at real coordinates with real pixel content.

### Coverage gaps (documented, acceptable)

- Set logos: 46 / 207 English set names have no pokemontcg.io entry
  (list above) → text fallback. Japanese sets not covered (`/sets` is
  English-only). No logo for a set below `SET_MIN_LISTINGS` since it has
  no tile.
- Species sprites: full 1–1025 coverage; forms/regionals share the base
  dex sprite (intentional — tiles are per base species).

## /sets/[slug] — "every card in this set" grid — 2026-08-30 — SHIPPED

`/sets/<slug>` showed only the set's active deals. It now also shows
**every card in the set** from `card_catalog` (the same source as the
species pages), same deal-vs-browse pattern.

### What changed

- **`lib/deals.js` → `fetchSetCatalog(setName, language)`** — new, the
  set-scoped twin of `fetchSpeciesCatalog`. `card_catalog` rows for the
  set (paged past the PostgREST 1000-row cap in 1000-row windows —
  needed for the ~1,960-row "World Championship Decks") + a scoped
  `deals` query (`watchlist.set = setName`, active) merged per
  `tcgplayer_id` into the exact `{ deal | null, refPrice, hubSlug, … }`
  card shape `SpeciesCard` already renders. **Deal detection untouched** —
  this only reads the `deals` table, never decides what a deal is.
- **`app/sets/[slug]/page.js`** — adds the pokemontcg.io set logo to the
  header (from the earlier logo work), an `id="deals"` heading on the
  existing deals grid, and below it a `<section>` "Every card in <set>"
  rendering the shared `<SpeciesCardList>`. Bounded `ItemList` JSON-LD of
  the catalogue cards (cap 100) added alongside the existing
  `BreadcrumbList`.
- **Components generalised, not forked.** `SpeciesCardList` /
  `SpeciesCard` took `speciesName`; they now take `label` (species name
  *or* set name) for the section headings + click-tracking, with
  `speciesName` still accepted as an alias. Analytics `eventData` key
  `species` → `context`. Callers (`app/pokemon/[slug]`,
  `components/SpeciesCatalog`) updated to `label=`. No new components.

### Decisions

- **Sort:** by the set's own card numbering — leading integer of
  `card_number` (`"103/130"`→103, `"H9"`→9, `"SWSH262"`→262), then a
  numeric-aware string compare; unnumbered cards last. Verified on
  `xy-flashfire`: the browse grid runs 1,2,3,…,109 in order (with 13,
  100, 101, 103 lifted into the deals section, which is itself ordered).
  This is more useful here than on species pages (a set is one numbered
  run) so it's set-only; species keep their deals-cheapest-then-refprice
  order.
- **Min to show the grid:** `SET_CATALOG_MIN_CARDS = 10`. A `/sets` page
  already needs `SET_MIN_LISTINGS = 3` active deals to exist at all;
  this second gate stops a near-empty "full catalogue" while
  `card_catalog` is mid-backfill. Below it, the deals grid still serves.
- **Max grid size:** `SET_CATALOG_MAX_BROWSE = 600` browse tiles (all
  deal-matched cards always kept). Every real expansion (~≤360 cards)
  renders whole; only the 3 oversized grab-bag "sets" truncate — World
  Championship Decks (602 of 1,960), Prize Pack Series (605 of 886) —
  with a "Cards in <set> (N of M)" heading. Keeps worst-case page weight
  ~3.5 MB instead of ~12 MB.

### Verification (local `next start`, `card_catalog` as of 2026-08-30, mid-backfill)

| Set | Era | `card_catalog` | PPT `cardCount` | Coverage | Grid on page | deals / browse shown |
| --- | --- | ---: | ---: | --- | --- | --- |
| **XY - Flashfire** | 2014 | 111 | 111 | **complete** | yes | 4 / 107 |
| Jungle | 1999 | 64 | 64 | **complete** | yes | 19 / 45 |
| Skyridge | 2003 | 182 | 182 | **complete** | yes | (grid renders) |
| SV: Prismatic Evolutions | 2025 | 355 | 355 | **complete** | yes | 10 / 345 |
| SM Promos | 2017–19 | 336 | 333 | complete (+3) | yes | (grid renders) |
| **Base Set** | 1999 | 0 | 102 | **known backfill gap** | no (< 10) | deals grid only |
| WoTC Promo | 1999+ | 0 | 70 | **known backfill gap** | no | deals grid only |
| World Championship Decks | n/a | 1,960 | — | complete | yes (truncated) | 2 / 600 |

Every set whose page renders the grid has `card_catalog` count == PPT's
own `cardCount` (±3). **The thin/absent grids are the documented A4
`card_catalog` sync gap** (`## Card data completeness`), not a bug in
this change — 40 of 155 set pages are below the 10-card gate right now
and will fill in when the outstanding `/export` sync completes.

- Affiliate links on browse cards verified: every "View on eBay" carries
  `campid=5339197414` + `mkcid=1` + `mkrid=711-53200-19255-0` +
  `mkevt=1` (same EPN wrapping as the rest of the site).
- CWV: card images all `loading="lazy"` in fixed aspect-square boxes
  (no CLS), grid below the fold, no render-blocking additions. Largest
  real set page (Prismatic, 355 cards) ≈ 2.2 MB HTML, TTFB ~15 ms from
  ISR; same pattern/weight class as the large species pages.
- `test:seo` 57/57, `test:scanner` 11/11, `npm run build` clean.
- `scripts/auditSetCatalog.js` — new, prints the `card_catalog`-vs-PPT
  count per set page + how many will render the grid.

## Sealed products: set-page section + standalone hub — 2026-08-30 — SHIPPED

The sealed twin of the card-catalogue work. `/sets/<slug>` gains a
"Sealed products for <set>" section; `/sealed-deals` is reworked from a
deals-only rotation into a searchable/filterable catalogue.

### Phase 1 — data access (confirmed live, not assumed)

- **`/sealed-products` works on Business** (1 credit per product
  returned). `?setName=<display name>` filters directly — verified
  `?setName=SWSH07: Evolving Skies` → 31 products. No un-filtered
  browse-all (`?` alone → 400), but every-set iteration covers it.
- **Images:** `tcgplayer-cdn.tcgplayer.com/product/<id>_in_NNN.jpg` —
  the *exact* host + path the ~29k card thumbnails already use (already
  in `next.config.mjs`). Verified a real product photo: **200, 26 KB,
  image/jpeg**. Not the blocked `set_icon` path.
- **Licensing:** PPT's caching / first-party-display clause is written
  about API *responses* generally; it doesn't distinguish singles from
  sealed. Same posture as `card_catalog` — stated, not silently carried.
- A bulk **`/export?type=sealed` exists** but shares the 2/day export cap
  (spent by the card backfill), so the sync walks every English set via
  `?setName=` instead (~219 requests, paced under the per-minute window).

### Phase 2 — data architecture

- **New `sealed_catalog` table** (`supabase/sealed_catalog_migration.sql`,
  run in the SQL editor) — the exact structural twin of `card_catalog`:
  `tcgplayer_id` PK, `name`, `set` (PPT setName), `set_id`,
  `product_type`, `market_price` (PPT `unopenedPrice`), `image_url`,
  `source`, RLS-disabled + anon `select` grant.
- **`lib/sealedCatalog.js`** — `sealedProductType(name)` derives a stable
  filterable type from the name (PPT has no `type` field): Booster Box /
  Elite Trainer Box / Booster Bundle / Blister / Booster Pack / Build &
  Battle / Collection Box / Tin / Hanger Box / Case / Other. Order-of-
  rules matters ("Booster Box Case" → Case, "…Elite Trainer Box" → ETB).
  Plus `sealedCatalogRecord()`, shared by both sync entry points.
- **Sync:** `app/api/sync-sealed-catalog/route.js` (cron `0 5 * * *`,
  added to `vercel.json`) **and** `scripts/syncSealedCatalog.js`
  (off-Vercel, no timeout) — both call `listSealedProductsForSet()` per
  set and upsert. Idempotent (`onConflict: tcgplayer_id`). Reference
  data, never re-exported.
- Sources stay distinguishable internally exactly as with cards:
  `sealed_deals` = our eBay scan (deals), `sealed_watchlist` = the ~48
  we re-scan, `sealed_catalog` = PPT reference (`source` +
  `market_price` column name mark every row).

### Phase 3 — `/sets/<slug>` sealed section

`lib/deals.js` → `fetchSetSealedCatalog(setName)` mirrors
`fetchSetCatalog`: `sealed_catalog` rows for the set + active
`sealed_deals` (joined through `sealed_watchlist`, keyed by
`tcgplayer_id`) merged into the same card object `SpeciesCard` renders.
Deals lead (cheapest first), then browse by descending reference price
(a set's headline sealed products *are* its priciest). Section gated on
**`SET_SEALED_MIN_PRODUCTS = 4`** (lower than the 10-card gate — a set
has far fewer sealed products than cards); browse capped at
**`SEALED_CATALOG_MAX_BROWSE = 200`**. Rendered by the same
`<SpeciesCardList>` — no fork; `SpeciesCard` gained `card.meta` /
`card.searchQuery` overrides so sealed tiles read "<set> · <type>" and
search eBay by the self-contained product name.

### Phase 4 — `/sealed-deals` reworked

Audited: it was a deals-only rotation pool + `?page=` pagination +
country/listing/price *deal* filters, no catalogue, no set/type filter.
Reworked to:
- a **"Live sealed deals right now"** strip (kept — 8 deduped current
  `SealedDealCard`s from the existing pool), then
- **`<SealedProductBrowser>`** (new client component, same
  progressive-enhancement shape as `PokemonFilterList`): name search,
  product-type filter chips, "deals only" toggle, collapsible per-set
  groups (sets that have a `/sets` page first, in release order, from
  the `catalog_snapshot`; the rest alphabetical). `fetchSealedCatalog()`
  groups the whole `sealed_catalog` by set with deal status merged.
- Dropped the deal-only country/listing/price filters + pagination (the
  browser + deals-only toggle replace them). Pre-sync, the browser shows
  a "still syncing" line and the live-deal strip still works
  (independent of `sealed_catalog`).

### Sync run + coverage

`node scripts/syncSealedCatalog.js` (2026-08-30): **2,329 distinct
products across 151 sets**, 0 duplicate ids, every row priced. ~6 min
with the 429 backoff (a naive run wedged instantly — `?limit=200` is
billed as ~20 "minute calls"). Type distribution after the classifier
tweak: Collection Box 435, Tin 418, Blister 317, Booster Pack 177,
Booster Bundle 147, ETB 131, Booster Box 65, Build & Battle 67, Case
227, Deck 184, Hanger Box 5, **Other 156** (was 407 before the tweak).

**Per-set count vs PokemonPriceTracker** (`scripts/auditSealedCatalog.js`):

| Set | `sealed_catalog` | PPT | verdict |
| --- | ---: | ---: | --- |
| SWSH07: Evolving Skies | 31 | 31 | **match** |
| SWSH08: Fusion Strike | 31 | 31 | **match** |
| SV07: Stellar Crown | 23 | 23 | **match** |
| SV: Prismatic Evolutions | 41 | 41 | **match** |
| XY - Flashfire | 6 | 6 | **match** |
| Base Set | 6 | 6 | **match** (PPT's loose `?setName=` returns 120 cross-set; only 6 are truly Base Set) |
| Jungle | 4 | 4 | **match** |

7/7 exact. 68 of 219 `listSets` names have no sealed products (Trainer
Kits, McDonald's promos, Shiny Vault / Trainer Gallery subsets,
promo-card sets) — genuine, not a sync gap.

### Set-page section (`/sets/<slug>`)

| Set | sealed section | deals / browse | notes |
| --- | --- | --- | --- |
| SWSH08: Fusion Strike | "Sealed products for … (31)" | 1 / 30 | deal tile emerald, links to `/sealed-deals` |
| SV: Prismatic Evolutions | "… (41)" | 1 / 40 | |
| SWSH07: Evolving Skies | "… (31)" | 0 / 31 | browse-only, no deal sub-heading |
| XY - Flashfire | "… (6)" | 0 / 6 | at the `SET_SEALED_MIN_PRODUCTS = 4` floor |
| Jungle | "… (4)" | 0 / 4 | at the floor |
| Legendary Treasures (2), Plasma Storm (1) | **no section** | — | below the floor — card deal grid still serves |

Browse order verified: type-priority (Booster Box leads, then Half
Booster Box, ETB, …; Case/Other sink), price as tiebreak. Sub-heading
reads "Every other <set> **sealed product**" (`SpeciesCardList` gained an
`itemNoun` prop). Deal tiles get the emerald border + "N% below market"
+ "See deal →" → `/sealed-deals`; browse tiles get the plain "View on
eBay".

### Standalone hub (`/sealed-deals`)

Renders: "Live sealed deals right now" strip (8 deduped `SealedDealCard`s
from the existing pool) → `<SealedProductBrowser>` with **151 set
groups** (sets with a `/sets` page first, in `catalog_snapshot` order),
**12 product-type chips** (All types + the 11 real types), a name search,
and a "Deals only (N)" toggle. Only ~6 groups render their tile grids on
SSR (`openSets` default); the rest expand client-side — page is 1.31 MB,
TTFB ~16 ms from ISR. Pre-sync it degrades to a "still syncing" line with
the live-deal strip intact.

**Group-header set logos (2026-08-30).** Each collapsible group header
carries the set's pokemontcg.io logo next to the name — the same
`lib/setImages.js` assets `/sets` uses, enriched onto each group in
`app/sealed-deals/page.js` via `setImage(g.set)?.logo`. Fixed 64×28 box
(`h-7 w-16`), lazy `next/image`, so the collapsed list stays even with
zero CLS. **126 of the 151 groups have a logo (~83 %)**, in line with the
`/sets` coverage (161/207, ~78%); the other 25 fall back to text-only
(empty box, no broken image). CWV: `fetchpriority="high"` count on the
page is **0** — every logo is lazy, only the ~14 in the first viewport
are fetched; page markup grew ~0.24 MB (srcSet strings, not downloads).

### Affiliate / images / CWV / tests

- **Affiliate:** browse tiles use the same `buildEbaySearchLink()` path
  as every other "View on eBay" on the site — raw HTML confirms
  `campid=5339197414` + `mkcid=1` + `mkrid=711-53200-19255-0` +
  `mkevt=1` on the sealed tiles. `card.searchQuery = product name` so
  the query is the self-contained name ("Evolving Skies Booster Box"),
  not name+set.
- **Images:** all on `tcgplayer-cdn.tcgplayer.com/product/*` (already an
  allowed host). A HEAD sweep of all 2,329 found **52 (2.2 %) that
  403/404** (scattered, mostly older "Miscellaneous" products) — those
  `image_url`s were set to `null` so `SpeciesCard` renders the
  `CardImagePlaceholder`, no broken `<img>`. The sync script now runs
  that prune as a final pass so it self-heals.
- **No new thin indexable pages** — the hub and the set pages already
  existed; this adds sections/content to them, no new routes.
- **CWV:** all sealed tiles are lazy `next/image` in fixed aspect-square
  boxes (no CLS). Largest combined page (Prismatic: 355 cards + 41
  sealed) ≈ 2.40 MB, up ~0.24 MB from card-only; hub ≈ 1.31 MB.
- `test:seo` **57/57**, `test:scanner` **11/11**, `npm run build` clean.
- `scripts/auditSealedCatalog.js` — new; per-set `sealed_catalog`-vs-PPT
  count + a live image-resolve check.

### Coverage: remaining 68 sets checked — 2026-08-30

Ran `scripts/syncSealedCatalogSets.js --file` (new — targeted per-set
sealed sync + per-set progress + the `flagImplausibleSealedPrices` pass)
against the **68 `listSets` names with no `sealed_catalog` rows**.

**Result: 0 new products, 0 new sets.** Total stays **2,329 products /
151 of 219 sets**. Every one of the 68 returned no product whose own
`setName` is that set — PokemonPriceTracker's `/sealed-products` endpoint
genuinely has nothing for them. Verified the notable ones aren't a
name-spelling miss: `?setName=` and `?search=` for "EX Sandstorm Booster
Box", "Skyridge Booster Box", "EX Ruby & Sapphire", "Expedition Base
Set" etc. all return **empty**. `flagImplausibleSealedPrices` ran on the
(empty) new set — 0 nulled, so no new placeholder prices were let in.

The 68, categorised:

| Category | n | Why no sealed product |
| --- | ---: | --- |
| Promo sets (McDonald's, WoTC, Nintendo, SM/XY/SV/SWSH Promos, …) | 24 | promos aren't sold as sealed boxes |
| Trainer / Training / Starter Kits (EX/XY/BW/HGSS/DP kits, Kalos Starter Set) | 11 | are sealed themselves but PPT doesn't catalogue them |
| Subsets (Shiny Vault, Radiant Collection, Trainer/Galarian Gallery, Classic Collection) | 11 | no standalone sealed — the parent set is covered |
| **Old sets PPT has no sealed data for** (EX Sandstorm → EX Dragon, Skyridge, Dark Explorers) | 13 | real sealed boxes exist in the world; **PPT just doesn't track them** — not fixable from our side |
| Misc non-sealed "sets" (Jumbo Cards, Energies, Prize Pack, e-Reader Sample, Blister/Deck Exclusives, Rumble, League & Championship) | 9 | not sealed-product sets by nature |

Only the 13 vintage EX/e-Card sets are a genuine catalogue gap, and it's
a **PokemonPriceTracker limitation** (no upstream data), not a sync bug —
nothing more to fetch. `test:seo` 57/57, `test:scanner` 11/11, build
clean; spot-checked `/sets/sv09-journey-together` (25), `swsh05-battle-
styles` (27), `sm-cosmic-eclipse` (15), `sv-paldean-fates` (33) — sealed
sections render, no regression.

### Follow-up: can the site price the 13 uncovered vintage sets itself? — 2026-08-30 — NO (Phase 3)

**Phase 1 — what the price mechanism actually is.** Every reference /
market price on the site (`card_catalog.market_price`,
`sealed_catalog.market_price`, per-condition + graded prices on
`/deals/[id]`) comes from **PokemonPriceTracker**. The site's copy
("backed by recent eBay sold listings") describes *PPT's* methodology,
which the site relays — there is **no in-house eBay-sold-price
computation** to extend. The site's own eBay integration
(`lib/ebay.js`) is the **Browse API only** (`/buy/browse/v1/
item_summary/search`) — active listings, no sold/completed data. The
only sold listings shown anywhere are PPT's `soldListings` array
(`includeEbay=true`), rendered verbatim on `/deals/[id]`.

**Phase 2 — not feasible.** A sold-listings reference price would need
either eBay's **Marketplace Insights API** (separate `buy.marketplace.
insights` OAuth scope + eBay partner approval — the site requests only
the base `api_scope` and is on the default 5k/day Browse tier) or the
**Finding API `findCompletedItems`** (eBay removed completed-item data
from that API years ago). Scraping eBay's sold search pages is the
"publicly viewable ≠ permission" case the brief rules out.

**Browse API active listings can't stand in.** Live query for these,
run for real:

- `EX Sandstorm Booster Box` — **11 total results**: mostly *empty*
  boxes ($20–$400), theme-deck boxes, single cards with "Booster Box" in
  the title; the two genuine sealed listings are aspirational asks at
  **$50,090** and **$57,925**.
- `Skyridge Booster Box` — **9 total**: empty-box lots ($2–$15), an
  *empty* display box at $4,999, wrong-set items ("151 Japanese"), and
  two real sealed asks at **$250,000** and **$325,997**.

Asking prices ≠ sold prices (vintage sealed sits listed for months at
aspirational numbers), volume is 1–5 real listings, and the pool is
heavily contaminated by repros / empties. Any central-tendency number
off that is a **fabricated price**, which the site's own rules
(`flagImplausibleSealedPrices`, the `$0.00` fix) exist to prevent.

**Phase 3 — end state (accepted).** The 13 vintage EX/e-Card sets keep
**no `sealed_catalog` rows → no sealed section** on their `/sets/<slug>`
pages, and don't appear on `/sealed-deals`. Anyone after a Skyridge box
uses the existing browsable "View on eBay" path. No code change; no
fabricated data introduced. `test:seo` 57/57, `test:scanner` 11/11,
build clean.

### Coverage gaps (documented)

- **13 vintage sets (EX Sandstorm–EX Dragon, Skyridge, Dark Explorers)**
  have no `sealed_catalog` rows — PPT catalogues no sealed product for
  them and the site has no first-party way to price them (see the
  follow-up above). Their `/sets/<slug>` pages simply show no sealed
  section.
- Sealed deal coverage is inherently sparse — `sealed_watchlist` is only
  ~48 hand-picked products, so only ~50 active sealed deals across ~17
  sets right now. Every other sealed product shows as browse-only. This
  matches the old page's own copy ("small, hand-picked watchlist").
- The cron route (`/api/sync-sealed-catalog`, `0 5 * * *`) is best-effort
  within `maxDuration` and skips the image-prune pass;
  `scripts/syncSealedCatalog.js` is the reliable full path (no timeout,
  includes the prune).
- A set with < 4 catalogued sealed products shows no section even if it
  has an active sealed deal (same trade-off as `SET_CATALOG_MIN_CARDS`);
  those deals still surface on the standalone hub.

### Follow-up: "Base Set booster box ~$600" bug — 2026-08-30 — FIXED

**Root cause: bad reference data from PokemonPriceTracker, not a
matching / currency / code bug.** The tile was
`Base Set Booster Box [Revised Unlimited Edition]` (the 2000 reprint
run, id 185731) — a real, correctly-classified product — with PPT's
`unopenedPrice` = **$499.99**, a value that is *also* attached to
`Base Set (Shadowless) [1st Edition] Booster Box` (id, real value
~$300k+) and reads as a placeholder for "no real comps". PPT has no
sales data for ultra-rare vintage sealed product and emits a low
figure. The classifier was right; the price was wrong.

Not a live deal — there is no active `sealed_deal` for any vintage Base
Set box (the only Base-Set-ish sealed deal is a correctly-priced $175
SV01 half booster box). So the eBay-listing-trust angle didn't apply
here; for completeness, the sealed deal scanner already runs the same
class of checks the card scanner does (`isTrustworthySealedListing`,
`listingMatchesSealedProduct`, `SANITY_FLOOR_PCT` price floor in
`app/api/refresh-sealed-deals/route.js`).

**Fix** (`lib/sealedCatalog.js` → `flagImplausibleSealedPrices`, run in
both sync entry points + a one-time backfill): null `market_price` on
any **Booster Box** whose price is **≤ the set's most expensive Booster
Pack** (a box holds ~36 packs — it can never be worth less than one) or
**< $40** absolute. `SpeciesCard` already renders "Price unavailable"
+ the eBay search for a null reference price (same posture as the
card-side `$0.00` fix). Precise — it nulled exactly **3 rows** catalogue-
wide, zero false positives:

| Product | was | why |
| --- | ---: | --- |
| Base Set Booster Box [Revised Unlimited Edition] | $499.99 | < its own set's pack ($838.20) |
| Base Set (Shadowless) [1st Edition] Booster Box | $499.99 | < that set's pack ($15,000) |
| Pitch Black Half Booster Boxes (ME05) | $8.99 | < $40 floor |

**Spot-check of other high-value vintage sealed** (`scripts/auditSealed
Catalog.js` data): every remaining pre-2004 sealed price is now
plausible — Gym Heroes / Gym Challenge Unlimited boxes $10k–$14k;
single WOTC Unlimited/1st-Ed booster packs $280–$2,095; sealed WOTC
theme decks $165–$700. The `Base Set Booster Pack [Revised Unlimited]`
at $838.20 was checked and **left as-is** — freshly scraped, no logical
contradiction (its box is now null), and reprint-run singles genuinely
trade that high. `test:seo` 57/57, `test:scanner` 11/11, build clean.

## Head-term audit + homepage keyword targeting — 2026-08-30

Full re-audit of prior SEO work against production + a keyword-targeting
pass for the head terms **"Pokemon deals" / "Pokemon card deals" /
"Pokemon TCG deals"**.

### Phase 1 audit — current state (verified live, 13 routes)

- **JSON-LD** — `Organization` + `WebSite` (+ `#organization` / `#website`
  `@id`s) site-wide from `app/layout.js`; `FAQPage` + `CollectionPage`
  on `/`; `BreadcrumbList` + `ItemList`/`CollectionPage` on list pages;
  `Product`/`Offer` only on `/cards/[slug]`, `/deals/[id]`,
  `/sealed-deals/[id]`. All parse as valid JSON. **No regression.**
- **Metadata** — unique title + description + one H1 per page across
  `/`, `/pokemon*`, `/sets*`, `/cards*`, `/deals*`, `/market-data*`.
  **0 duplicate titles, 0 duplicate descriptions** across the sample.
- **Canonical** — exactly one, self-referencing, absolute per page.
  Params stripped: `/deals/graded?maxPrice=100`, `/sets/base-set?page=2`,
  `?country=…&sort=…` all canonical to the bare path. **Country-param
  behaviour still holds.**
- **Robots** — `robots.txt`: `Allow: /`, `Disallow: /api/`, sitemap
  declared. No `<meta name=robots>` on any indexable page (default
  index,follow). No accidental noindex, no faceted-URL indexing.
- **Sitemap** — index → 6 child sitemaps; `/deals` + all 7
  `/deals/<category>` now included in `pages.xml`; redirect slugs
  excluded.
- **Internal linking** — dense crawlable `<a>` graph (29–1,041
  links/page); every page carries the nav's `/deals/graded` +
  `/deals/auctions`; `/pokemon` → 1,000+ species pages, `/sets` → every
  set page.
- **CWV / speed** — `/deals/*` TTFB ~90–110 ms, edge-cached (ISR).
  `/`, `/best-finds`, `/japanese-cards`, `/sealed-deals` stay dynamic
  (`no-store`) — 4 URLs, documented, CWV previously "Good" in Speed
  Insights. `/pokemon/charizard` ~618 KB is the heaviest page.
- **Search Console** — **not accessible from this codebase** (no API
  integration, no credentials; only `docs/gsc-readiness.md` exists as a
  setup guide). Impressions / clicks / average position / index count
  cannot be reported from here — that is the actual ground truth and it
  has to be read in the GSC UI.

### Phases 2–3 — keyword targeting (changed)

The homepage is the primary head-term candidate; it had the phrase in
**neither its title nor its H1** (title was the bare brand, H1 was "Find
underpriced Pokemon cards on eBay"). `/deals` *did* carry "Pokemon Card
Deals" in title + H1 → mild cannibalisation with the weaker-signalled
root. Fixed with natural copy only:

- `/` `<title>` → "Pokemon Card Deals — Cards Priced Below Market on eBay
  | Pokemon Deal Finder"; new `/`-specific `<meta description>` leading
  with "Live Pokemon card deals…".
- `/` `<h1>` → "Pokemon Card Deals — Underpriced Cards on eBay" (keeps
  the value framing).
- `/` crawler-summary `<p>` → "…Pokemon **TCG** cards… surfacing only
  the **genuine deals**…" (adds the "TCG" variant + "deals" once, natural).
- `/` "start here" chips repointed from `/?maxPrice=25` / `/?type=graded`
  (renderer-nofollowed) to `/deals/under-25` / `/deals/under-50` /
  `/deals/graded` — real crawlable routes, descriptive anchors; `$100+`
  stays a nofollow filter link (no dedicated route, not worth one).
- `/deals` `<title>`/`<h1>` reframed to "Browse Pokemon Card Deals by
  Price, Grade & Era" so `/` is the unambiguous primary and `/deals`
  owns the long-tail.

No stuffing — the phrase appears once each in title / H1 / summary.
`tests/seo/identity.test.mjs` regex widened `Pokemon (TCG )?cards` to
match the natural variant.

### Phase 4 — page-type gaps

None built. `/deals/` + the 7 `/deals/<category>` routes (added
2026-08-30, see the deal-landing-routes section) already cover the
category intent with real, non-duplicate data. A `/pokemon-tcg-deals/`
URL would only cannibalise `/` — not built.

### Phase 5 — technical sweep

`test:seo` **63/63**, `test:scanner` **11/11**, `npm run build` clean.
No broken internal links, no new duplicate-metadata patterns, no
orphaned pages, JSON-LD valid on every changed page. Identity /
freshness / canonical / country-param handling all re-verified intact.

### Phase 6 — out of scope (on record)

Full inventory in **`docs/seo-headterm-strategy.md`**: for head terms
this broad, backlinks / brand-search volume / PR / domain age are the
dominant factors and **cannot be moved from this codebase**. On-page
work is necessary but not sufficient — if positions for the three head
terms don't improve despite correct execution, that is expected. The
realistic near-term wins are long-tail (entity, set, species,
deal-category pages), which the architecture is built for.

## Sealed-deal scan expansion (rec b) + A4 status — 2026-08-30

### Part 1 — sealed-deal scan expansion — SHIPPED (commit `f4b1c46`)

Implemented `docs/scanning-architecture.md` §6 rec (b): auto-promote
Booster Box + Elite Trainer Box products (`market_price >= $25`) from
`sealed_catalog` into `sealed_watchlist` for active eBay deal scanning.
Fits the current 5,000/day Browse budget — **no rate-limit increase
needed**.

- **`/api/sync-sealed-watchlist`** (new, cron `30 5 * * *` — between the
  05:00 catalogue sync and the 06:00 deal scan): DB→DB, mirrors
  `sync-watchlist`. Qualifying `sealed_catalog` rows → `sealed_watchlist`
  `source: "auto"`; a `retireStaleAutoRows` equivalent deactivates auto
  rows that stop qualifying; the 48 `source: "manual"` rows are never
  touched. Criteria in `lib/sealedCatalog.js` (`SEALED_AUTO_SCAN_TYPES`,
  `SEALED_AUTO_MIN_PRICE`).
- **`refresh-sealed-deals`** — reads reference prices from
  `sealed_catalog` (batch, keyed by `tcgplayer_id`) instead of one live
  `getSealedPrice` per product. A first full run showed ~half the
  products skipped on PPT 500/min 429s otherwise; live `getSealedPrice`
  stays as the fallback for products not in the catalogue.
  `maxDuration` 300 → 500.
- **`lib/sitemap.js`** — `fetchActiveDealIds` now filters
  `is_active = true` (it never did). 53 expired `/sealed-deals/[id]`
  (and recently-expired `/deals/[id]` inside the newest-5000 slice)
  noindex URLs were in the sitemap until the 900 s cache refreshed —
  surfaced by the expire step of the test scan run, caught by
  `tests/seo/sitemap.test.mjs`.

**Real numbers — first full run (2026-08-30):**

| Metric | Before | After |
| --- | ---: | ---: |
| `sealed_watchlist` active | 48 | **194** (48 manual + 146 auto) |
| Sets with sealed-deal **scan** coverage | ~17 | **71** |
| Active `sealed_deals` | ~50 | **425 across 36 sets** (184 from auto rows) |
| eBay Browse cost / day (sealed) | ~240 | **~970** (measured 760 that run) |
| Daily Browse total | ~2,600–3,400 | ~3,300–4,100 (< 5,000) |

Run: 49 s, 0 errors, 970 (product × marketplace) scans, 30 new deals
upserted. **0 contested-auction deals** (trust check holds).
Spot-checked `/sets/me05-pitch-black` — a set with zero sealed-deal
coverage before — now renders **10 emerald deal tiles** in its sealed
section. `test:scanner` 11/11, build clean. `test:seo` 62/63 — the one
failure (`/deals/24409`, a card deal-detail title of 77 chars from an
unusually long card name) is **pre-existing and unrelated to sealed
scanning**, surfaced by the suite's random deal-ID sampling; the
deal-title logic deliberately keeps full card/set names intact, so
tightening it for outlier names is a separate design call, not a bug
here.

### Part 2 — A4 card catalog sync — still blocked, correctly

As of 2026-08-30 20:30 UTC: background job `b1a0ui2ht` is alive and
waiting on the PPT `/export` 2/day quota, target `2026-08-31T00:05:00Z`
(~3.5 h out). `card_catalog` unchanged at **21,175 / 16,656 with
species**. The manual fallback would just re-hit the 429 (reset time is
future). Fires + re-audits on its own once the quota clears.

## Additional eBay marketplaces — research → EBAY_IT added — 2026-08-31

### Research + tiered-rollout modeling (recommendation only, no code)

Two analysis passes preceded the change:

1. **Which additional marketplaces are worth adding.** Browse API
   supports FR/IT/ES/IE/NL officially (AT/CH work in probes,
   unofficial). Live `itemLocationCountry` probes for domestic seller
   depth ("charizard", cross-checked with 4 other queries):
   **IT 19,423** (> live EBAY_CA 11,829, ~4× live EBAY_DE 4,944) —
   FR 1,570 · ES 1,007 · NL 965 (all below the EBAY_DE "worth-it" floor)
   — IE 289 · AT 256 · CH ~250 (negligible). EPN campaign ID
   `5339197414` covers every international marketplace automatically —
   no per-country affiliate setup. EUR already wired end-to-end.
2. **Tiered / reduced-cadence rollout for the thin markets.** Modeled
   and rejected: `runSweep` never expires deals (only the per-card
   priority/extended tiers do), so every scanned market needs a
   per-card pass — a hard floor of ~225 Browse calls/day/market
   regardless of how "reduced" the cadence is. IT + FR/ES/NL at that
   floor is ~1,250/day, over the ~900–1,500/day headroom. No honest
   config fits more than IT now. FR/ES/NL wait for the rate-limit
   increase (case #00450936); IE/AT/CH aren't worth a cron slot or the
   CHF plumbing at any cadence.

### EBAY_IT added as the 6th live marketplace — SHIPPED

| File | Change |
| --- | --- |
| `lib/ebay.js` | `MARKETPLACES.EBAY_IT = { label: "Italy", flag: "🇮🇹", currency: "EUR" }` |
| `app/api/refresh-deals/route.js` | `EXTENDED_CHUNKS` 6 → 5 (6 countries × 5 chunks = 30 daily cron slots; per-country full-rotation cadence unchanged at ~30 days; `chunkOf` is hash-of-id, no migration) |
| `vercel.json` | +1 sweep cron (`country=EBAY_IT`, `10 */2 * * *`, 8 pages); extended-tier block regenerated as 5 chunks × 6 countries, days 1–30 |
| `lib/money.js` | `MARKETPLACE_CURRENCY.EBAY_IT = "EUR"` (`SYMBOL` already had `€`; `lib/fx.js` `NEEDED`/`FALLBACK` already had EUR — no FX change) |
| `components/RegionControl.js` | Italy row in `REGIONS` (the hand-synced picker list) |
| `lib/geo.js` | `IT → EBAY_IT` so Italian visitors geo-default to the Italy marketplace |
| `app/page.js`, `app/about`, `app/how-it-works`, `app/methodology` | marketplace-list copy: "five" → "six", added Italy |
| `tests/seo/identity.test.mjs` | homepage "which markets" assertion now includes Italy |
| `docs/scanning-architecture.md`, `docs/ebay-rate-limits.md` | budget tables + cron tables updated to 6 marketplaces |

Auto-picked-up, no change needed (verified): the sweep resolves
`?country=` per request; the priority tier scans `Object.keys(MARKETPLACES)`
so IT joins at full cadence (21 cards × 4 runs/day); `refresh-sealed-deals`
scans `Object.keys(MARKETPLACES)` so IT joins the daily sealed scan
(~194 products); `FilterBar` and `SearchClient` iterate `MARKETPLACES`
for their country dropdowns; `<DealCard>` / `<SealedDealCard>` /
deal-detail pages read `MARKETPLACES[deal.marketplace]` for flag + label.

**Pre-launch budget estimate:** +~575 Browse calls/day (sweep ~125 +
priority ~90 + extended ~163 amortised + sealed ~194), landing the daily
total at ~3,900–4,700 of 5,000 — same "fits current headroom" profile as
the sealed-scan expansion. Peak on an IT extended-chunk day is covered by
the pre-flight `getBrowseRateLimit()` guard (extended floor 1,500).

**Verification (2026-08-31):**
- `test:scanner` 11/11, `test:seo` 63/63, `next build` clean.
- Live `searchListings(…, "EBAY_IT")` probe: real inventory
  ("charizard base set" total 4,461; "pikachu ex 151" 723; "umbreon
  vmax alt art" 76), prices in **EUR**, `itemLocation.country`
  populated (drives `is_local` sort). Affiliate URLs come back as
  `ebay.it/itm/…` with `mkcid=1&mkrid=724-53478-19255-0&campid=5339197414`
  — eBay auto-generates the correct **Italy rotation ID**; attribution
  confirmed on every sampled listing.
- Browse quota at probe time: 1,500 remaining of 5,000 (consistent with
  prior measurements; IT's crons haven't run yet).

**Post-launch follow-up (pending real cron runs):** monitor one full day
including an IT extended-chunk day (`0 4 6 * *` / `12` / `18` / `24` /
`30`), confirm the daily Browse total stays < 5,000 and the pre-flight
guard defers extended cleanly on any tight day; spot-check a rendered IT
deal tile + affiliate click-through; confirm the re-chunk didn't drop
coverage for the existing 5 markets (every country still gets a chunk
across days 1–30). Update this section with the observed numbers.

## External discovery ingestion (PokeDealFinder board → our pipeline) — 2026-08-31

### Premise (per site-operator representation)

The operator states they have permission from PokeDealFinder to use its
public deal board as a discovery source. This integration takes **only the
public eBay item id + marketplace** off that board as a *hint*; every item
is then independently re-fetched via our own eBay Browse API, re-validated
through our own trust/match/score pipeline, matched against our own
`card_catalog`, and wrapped with our own affiliate links. No PokeDealFinder
affiliate link, tracking param, branding, or content is imported or shown.
Recorded here because provenance matters if terms are revisited:
- **PokeDealFinder permission** — taken as represented by the operator; not
  independently verifiable from the codebase.
- **eBay API License Agreement** — ingesting externally-sourced item ids and
  looking them up via Browse stays the operator's compliance call. Nothing
  here evades quota: verification is real Browse calls, guarded and capped.

### Key technical finding — no batch lookup

eBay's `getItems` (20-ids-per-call) **403s "Access denied"** on this
production keyset (restricted Buy API). `get_item_by_legacy_id` works, so
verification is **one Browse call per new item**. This is why the design is
hourly + capped + high-floor-gated rather than 15-min: it can only ever be
a *spare-capacity supplement*, not a substitute for a spent quota (the
original brief's "fallback when our quota is maxed" framing isn't
achievable — verifying costs the same budget).

### What shipped

| File | Change |
| --- | --- |
| `supabase/deals_feed_discovery_migration.sql` | **NEW — must be run in SQL Editor before deploy.** `deals.watchlist_id` → nullable; `+ card_catalog_id` FK; `+ discovery_source` (`scan` / `external` / `scan+external`) with a merge trigger; `+ card_name/card_set/card_language/card_tcgplayer_id` resolved columns filled by a `BEFORE INSERT/UPDATE` trigger from whichever ref is set; `deals_has_card_ref` check; backfill; indexes |
| `lib/pokeFeed.js` | NEW — `fetchFeed()` (timeout + retry, failures are no-ops) and pure `parseFeedHtml()`: pulls `/itm/<id>` + eBay TLD→marketplace out of each board row's `du` param |
| `lib/ebay.js` | NEW `getItemsByLegacyIds(ids, marketplace, {concurrency})` — bounded-parallel `get_item_by_legacy_id`, maps via `mapItemSummary`, returns `{listings, calls}` |
| `app/api/ingest-feed/route.js` | NEW cron route — quota guard (floor 800), feed parse, skip-if-verified-<20h (DB-only `last_seen_at` bump for still-listed), ≤40 new/cycle, per-marketplace Browse verify, `card_catalog` whole-word match index, trust + discount 0.1 + sanity-floor 0.25 gates, upsert `discovery_source:'external'`, feed-absence expiry (2-day grace for feed-only rows) |
| `vercel.json` | `+ {"path":"/api/ingest-feed","schedule":"0 * * * *"}` |
| `lib/deals.js` | `cardColsReady()` probe + `withCard()` normaliser (exported). `fetchDealsPoolUncached` + `fetchDealsPageUncached` prefer flat `card_*` columns / fall back to the `watchlist:!inner` embed until the migration runs; dedup key falls back to `card_tcgplayer_id`; rows normalised so every consumer keeps reading `deal.watchlist?.name` unchanged |
| `app/deals/[id]/page.js` | same prefer-`card_*`/fallback + `withCard()` |
| `tests/scanner/poke-feed.test.mjs` | NEW — parser contract (id/marketplace extraction, drops unresolvable rows, dedup) |
| `docs/scanning-architecture.md`, `docs/ebay-rate-limits.md` | new plane documented; budget table + typical-total updated |

### Scope of surfacing (v1)

Feed-discovered **catalogue-only** deals (no watchlist row) appear in the
**main deal grids** (`fetchDealsPool` → homepage + `/japanese-cards`;
`fetchDealsPage` → `/deals`, category, set/species, paginated) and the
**deal detail page**. They do **not** yet appear in: Best Finds,
Auctions-Ending-Soon, the `catalog_snapshot` aggregates (`/sets`,
`/pokemon`, card hubs), `/search`, or market-data — those still use
`watchlist:!inner` and are a documented **phase-2** follow-up. Feed deals
whose card *is* watched carry `watchlist_id` and already appear everywhere.

### Deploy order

1. Run `supabase/deals_feed_discovery_migration.sql` in the Supabase SQL
   Editor. (Code is safe in either order — `cardColsReady()` falls back to
   the old embed until the columns exist — but `ingest-feed` writes fail
   the `deals_has_card_ref` check until it's applied.)
2. Deploy. `ingest-feed` runs hourly; it self-skips below `remaining` 800.

### Verification done (2026-08-31)

- `test:scanner` **14/14** (3 new parser tests), `test:seo` **63/63**,
  `next build` clean. All read paths exercised via the legacy fallback
  (dev DB migration not applied) → **zero behaviour change** pre-migration.
- `parseFeedHtml` against the live board: **105 listings**, clean split
  24/24/24/24 GB/US/AU/CA + 9 DE (0 IT on the board right now), every row
  resolved to a 12-digit id + marketplace, 0 malformed.
- `getItemsByLegacyIds` live (EBAY_GB, 3 ids): 3/3 returned, prices in
  GBP, `itemLocation` populated, `affiliateUrl` carries
  `mkcid=1 & campid=5339197414`. **Confirmed 1 Browse call per item.**
- End-to-end dry run (feed → verify → match → price, no writes) on 6 real
  board items: correctly produced 1 DEAL (Gardevoir ex 217/091 Paldean
  Fates, 10% off), rejected 1 above-market match, 1 untrusted, 1 graded
  (skipped), 2 no-catalogue-match (no fabricated match). 6 items = 6
  Browse calls.

### Pending (needs the migration applied + real cron runs)

Confirm on prod: `ingest-feed` response counts sane; a feed-only deal
renders correctly on a grid + its detail page (flag, our eBay affiliate
URL carrying our campaign id **not** PokeDealFinder's, TCGPlayer link,
`discovery_source='external'` in the row); daily Browse total stays under
5,000 with the floor-800 guard skipping on tight days; feed-absence expiry
retires a feed-only deal ~2 days after it leaves the board. Then decide
whether phase-2 surfacing (Best Finds / aggregates / search) is worth it.

## Discovery-gap analytics — instrumentation only — 2026-08-31 (Phase 2)

### Why this is instrumentation, not analysis

Phase 2's goal is "why does the feed find listings our scanner doesn't,
and how do we close that in our own scanner." That is a **data-analysis**
task and **there is no data yet**: the Phase 1 migration isn't applied,
`ingest-feed` has never run, and there are zero `discovery_source =
'external'` rows. Producing the gap analysis / query-pattern findings /
scanner-change recommendations now would be the exact guessing the brief
forbids ("measure first, learn second, optimize third"; "Only recommend
changes supported by observed external-only data"). So this turn builds
the measurement apparatus and stops there.

### What shipped

| File | Role |
| --- | --- |
| `supabase/discovery_analytics_migration.sql` | **NEW — run after `deals_feed_discovery_migration.sql`.** `discovery_events` append-only table: one row each time the scanner or the feed *evaluates* a listing far enough to know its card. `listing_key` = `MARKETPLACE:<eBay legacy id>` (stable across both pipelines). Powers overlap-over-time, per-marketplace gap rate, scan-vs-feed latency, feed acceptance rate. RLS on, service-role only |
| `lib/discoveryLog.js` | NEW — `logDiscoveryEvent(db, …)` (**best-effort**, every failure swallowed — analytics can never break a scan), `legacyIdFromListingId()`, `discoveryListingKey()` |
| `app/api/refresh-deals/route.js` | `scanCardInMarketplace` takes a `searchType` param (`priority`/`extended`/`manual`); both its and `runSweep`'s `tryUpsert` fire one best-effort `discovery_events` insert on a successful deal upsert (`source:'scan'`, `search_type`, card id, discount). ~6 additive lines, no behaviour change — `test:scanner` 18/18, build clean |
| `app/api/ingest-feed/route.js` | logs one `discovery_events` row per **verified** listing (`source:'external'`, `became_deal` true/false, card id, discount, board href) — the Step-9 acceptance-rate denominator |
| `lib/pokeFeed.js` | parsed items now carry `sourceUrl` (the `/public/cards/…` href, minus the `du=` eBay-URL tail) — internal debug metadata only |
| `lib/discoveryAnalytics.js` | NEW — `discoveryReport(db, {days})`: Step 3 overlap (from `deals.discovery_source`), Step 7 per-marketplace external-only rate, Step 8 latency (median/p90/mean minutes + never-found-by-scanner %), Step 9 feed acceptance rate + median accepted discount. Carries a `dataSufficiency` gate (≥14 days, ≥300 external-only listings, ≥30 external accepted deals) — below it, `actionable:false` and the numbers are directional-only |
| `app/api/admin/discovery-report/route.js` | NEW — `Bearer CRON_SECRET`, `?days=1\|7\|30`, returns the report JSON. No public UI; never exposed to users |
| `tests/scanner/discovery-log.test.mjs` | NEW — cross-pipeline `listing_key` contract (RESTful id ↔ bare legacy id collide on one key) |

### Deliberately NOT built (needs accumulated data)

Steps 4–6 (title/query-pattern gap mining over external-only listings),
Step 11 (candidate prioritisation score — needs observed
acceptance-by-signal), Steps 12–13 (concrete scanner changes ranked by
accepted-deals-per-Browse-call), Step 15 (top-5 scanner changes to replace
the feed). The report endpoint lists these under `notComputedYet`.

### Design decisions

- **Append-only events table, not columns on `deals`.** `deals` is mutable
  current-state that ~20 read paths depend on; discovery history is
  immutable and multi-touch (a listing can be seen by sweep, then extended,
  then the feed). An events log captures the timeline; column-on-`deals`
  would only keep the last touch.
- **`discovery_source` stays the 3-value string** (`scan` / `external` /
  `scan+external`) from Phase 1, not an array. It already encodes exactly
  the A/B/C the overlap step needs; converting to `text[]` now is churn
  with no analytic gain.
- **Scanner logs only became-deal events; feed logs every verified
  listing.** Logging every listing the sweep evaluates would be
  hundreds–thousands of inserts per cycle. The feed side (≤40/cycle) can
  afford full logging, so feed acceptance rate is exact; scanner acceptance
  rate is read from `refresh-deals` run stats instead (noted in the report).
- **Not captured:** the scanner's constant filters/category (`183454`,
  `FIXED_PRICE|AUCTION`, `deliveryCountry`) — invariant, so per-row storage
  is pure noise (brief: "Do NOT store unnecessary data").

### Deploy order

1. `supabase/deals_feed_discovery_migration.sql` (Phase 1)
2. `supabase/discovery_analytics_migration.sql` (this)
3. Deploy. `ingest-feed` (hourly) + the scanner start writing `discovery_events`.

### Revisit threshold

Come back to the gap analysis (Steps 4–6, 11–13, 15) once
`GET /api/admin/discovery-report?days=14` returns
`dataSufficiency.sufficient: true` — i.e. **≥14 days** of feed runs,
**≥300** external-only listings, **≥30** external-only accepted deals.
Realistically ~3–4 weeks after the feed goes live. At that point the
report's `overlap` / `marketplaceGaps` / `discoveryLatency` / `dealQuality`
blocks are the evidence base for the scanner-improvement recommendations.

### Verified (2026-08-31)

`test:scanner` **18/18** (2 new discovery-log tests), `test:seo` **63/63**,
`next build` clean. `logDiscoveryEvent` is try/catch-wrapped so the scanner
and `ingest-feed` run unchanged whether or not `discovery_events` exists.
Not yet exercised against a live `discovery_events` table (migration
pending) — the report endpoint returns a explanatory 200 until then.

## Not building (deliberate, documented)

- **Phase 8 — dedicated price-history pages**: not building as separate `/cards/[slug]/price-history/` routes — price history is already integrated into the card hub and deal detail pages (chart + real data), and PokemonPriceTracker doesn't expose enough historical depth to justify a separate crawlable page beyond what's already shown. Documenting this as a deliberate scope decision, not an oversight.
- **Phase 23 — 404/410/redirect infra**: 404 (`notFound()`) already correct on all dynamic routes. No redirect/410 infrastructure built — slugs are derived from live data, not stored, so they only change if the derivation logic itself changes, which hasn't happened. Documenting as a deliberate "not needed given current architecture" rather than building unused speculative code.

## Known operational issue (unrelated to SEO code)

**eBay Browse API 429s — diagnosed 2026-08-28.** Not a mysterious block: eBay's Developer Analytics `getRateLimits` confirms the app is on the **default `buy.browse` tier of 5,000 calls/day** and spends the whole allocation (usually by mid-day), after which every search 429s until the ~07:00 UTC reset. Full write-up + the daily call budget in **`docs/ebay-rate-limits.md`**.

Mitigations applied (deploy pending): **pre-flight quota guard** — `getBrowseRateLimit()` in `lib/ebay.js`; both scan routes skip the run (`{ skipped: "ebay_rate_limited" }`) when live `remaining` is below a tier-aware floor (extended yields at 1500, priority 600, sweep/sealed 250) so the daily budget can no longer be *overrun* and the cheap user-facing sweep is protected. Plus volume trims in `vercel.json` (non-US sweeps hourly→3h, priority 4h→6h, sweep `GRADED_LOOKUP_CAP` 10→6) and a transient-only retry (`fetchWithRetry` — never retries a 429). Typical daily spend now ~2,600–3,400.

**Real fix (process, not code):** request a Browse API rate-limit increase in the eBay Developer portal — the app's affiliate use is exactly the intended Buy-API case. See the doc.

Does not affect any SEO-page code; existing active deals serve normally via the rotation pool regardless.

## Supabase Pro readiness audit + newsletter_subscribers P1 closeout — 2026-09-05

**Audit finding:** a read-only Supabase Pro production-readiness audit found that `supabase/newsletter_migration.sql` was committed to the repo but had **never been run against production** — `public.newsletter_subscribers` did not exist (confirmed via a live `PGRST205` read, re-confirmed a second time before this fix). Three code paths depended on it and silently mishandled the missing table: the newsletter opt-in checkbox on price-alert signup always claimed success, the confirm/unsubscribe links reported a genuine infrastructure failure as "this link is no longer valid," and the weekly digest cron returned HTTP 200 on a real query failure.

**Code fix shipped (this closeout):** new `lib/newsletterFlow.js` (pure decision helpers, no I/O) wired into `app/api/alerts/route.js`, `app/api/newsletter/route.js`, and `app/api/send-digest/route.js` so a genuine database/infrastructure failure is never reported as success or as "invalid token" — see `tests/scanner/newsletter-schema-drift-p1.test.mjs` (25 tests). This is a pure application-code fix; it does not by itself create the missing table.

**Schema fix — MIGRATION APPLIED: ✅ CONFIRMED.** The owner ran the already-committed, unmodified `supabase/newsletter_migration.sql` in the Supabase Dashboard SQL Editor ("Success. No rows returned"). Verified in production via read-only probes on **2026-09-05T03:22:03Z**:

- `public.newsletter_subscribers` exists; the prior `PGRST205: Could not find the table 'public.newsletter_subscribers' in the schema cache` is gone (service-role `select` now returns `200`, not `404`).
- All 8 expected columns (`id`, `email`, `token`, `confirmed`, `source`, `created_at`, `confirmed_at`, `unsubscribed_at`) are present and queryable (a `select` naming all of them returns no column error). Table is empty (0 rows) — expected, since the drift prevented any real signup from ever persisting.
- Service-role read: **PASS**. Anon read: **blocked** — direct evidence is inconclusive on this currently-empty table alone (0 visible rows is consistent with both "RLS is working" and "table is just empty"), so this was instead proven via the architecturally-identical `price_alerts` table (same "RLS enabled, zero policies" pattern, and it has a real row): service-role sees `count:1`, anon sees `count:0` on the exact same table — definitive proof this RLS pattern actively filters the anon role, not a coincidence of emptiness.
- The `newsletter_sendable` partial index is **UNVERIFIED** — not observable via PostgREST (no `pg_indexes` exposure without a dashboard/SQL-editor session); the migration that creates it is confirmed to have run without error, which is the available evidence.
- All three consumer queries (`app/api/newsletter`'s token lookup, `app/api/send-digest`'s subscriber query, `app/api/alerts`'s opt-in lookup) were re-run directly against production with obviously-nonexistent tokens/emails — all three now return `error: null` instead of `PGRST205`. No real subscriber, alert, or email was created/sent during any of this verification.

See the full audit (Supabase Pro readiness audit, 2026-09-05) and `docs/supabase-recovery-runbook.md` for the broader backup/RLS/index/retention findings — none of which required a code change.

## Deal-first premium overhaul — RELEASED; R7 observation pending — 2026-09-13

**Post-release corrections completed locally:** Set hierarchy is independently reviewed at `a640529`, species hierarchy/shared inventory-anchor behavior at `b15d792`, directory/release/sealed shopping at `5800891` plus `3fd49eb`, and the remaining search front door at `0a8f418`. Galleries: `../shots/set-hierarchy/index.html`, `../shots/species-hierarchy/index.html`, `../shots/browse-journey/index.html`, `../shots/search-journey/index.html`. These changes are NOT deployed. The owner's expanded page-template pass is locally complete within the representative provider-isolated states and recorded review limits; this is not verification of every production URL or completion of future/held PDF work. Existing phase and deployment gates remain in force.

**Current checkpoint (supersedes the historical status snapshots below):** The reviewed overhaul is live on pokemondealfinder.com at release SHA `c3501391f31bfa422b9726808ec0cca78d1fffe5`, Vercel `dpl_8Ds8aqKLgF15TcpVTBFrqvZiB6TC` READY. R2 corrections and R3–R5 implementation/reviews are closed; R6 local implementation, full build and three independent review rounds passed, followed by six hosted HTTP checks and four inspected initial-render screenshots. James explicitly approved both the read-only build dependency and the exact production push/deployment after their earlier denials; automatic review then allowed each action. R7 has a pre-release baseline only; post-release measurement and the 19 September GSC observation remain outstanding. Codex is the sole implementation writer; Claude is the bounded read-only reviewer. Stage B remains OWNER_SUSPENDED and outreach parked. The dated entries below retain their original evidence and do not reopen completed phases.

The additional 56-page Master Handover has been fully read and its supplied Markdown preserved unchanged at [docs/POKEMONDEALFINDER-MASTER-HANDOVER-2026-09-13.md](docs/POKEMONDEALFINDER-MASTER-HANDOVER-2026-09-13.md). It is historical context and a continuity reference, not another phase ledger, fresh verification, or permission expansion. This ledger and the current Deal-First Overhaul remain authoritative; see the reconciliation closeout at the end of this entry.

**Objective.** The primary commercial journey is: find a compelling, genuinely comparable offer, understand it, open the correct listing on eBay. Brief: `PokemonDealFinder-Deal-First-Overhaul.md` (supersedes the search-first homepage concept); first execution slice R0–R2 per `PokemonDealFinder-Claude-Start.md`. One active entry; packages R0–R7 tracked here. Older "planned" checklist/guide items stay superseded by the deployment record; 17C.11 / 17C.12 remain deployed (production HEAD `8b16321`); the identification guide, research discovery and collector-number fix stay completed; `1fd6769` and `b2f2e7f` stay separate local work pending reconciliation; Stage B suspended; outreach parked; the 19 September GSC review stays a note, not an automation.

**Branch / base / commits** — worktree `wt-dealfirst`, branch `deal-first-r0r2`, base = verified `origin/main` = production `8b16321395153f49bc303ffc2b10e8495a61ba9a` (Vercel `dpl_5csTmZEq1uk5Wy4f5QGwWg9t85Fp`, READY, aliased). Dirty main tree untouched.

| Commit | Package | Scope |
| --- | --- | --- |
| `bdaa4af` | R1 | `lib/navLinks.js`, `components/{SiteHeader,NavDropdown,NavMenu,SiteFooter,DealCard,ReferenceOfferCard}.js`, `app/globals.css`, dev sheet `app/dev/deal-states/page.js` + `lib/dev/dealStateFixtures.js`, `tests/scanner/deal-first-r1.test.mjs` (9), 6 pinned assertions updated |
| `d4f5eab` | R1 follow-up | `NavDropdown` no focus-open (keyboard), `Logo`/`SiteHeader` fit 320px |
| `946c2d4` | R2 | `app/page.js`, `components/{FilterBar,FilterToggle}.js` (`collapsible`), `tests/scanner/homepage-hierarchy.test.mjs` rewritten for the R2 order, 13C.5 / UX-CVR-2 / P0.4.1 / 17B pins updated |

### R0 — reconcile and baseline — DONE
- Read AGENTS.md (Next agent rules), PRODUCT.md, this ledger, the phase memory. `origin/main` re-verified = `8b16321` = production; no drift.
- Components inspected and REUSED: `SiteHeader`/`NavMenu`/`NavDropdown`, `app/page.js` lanes (`buildHomepageLanes`, `rotationBucket`, `selectDiverseLane`, `LANES` contract), `DealCard` + `AuctionPrice` + `DealImage` (`dealImageProps`), `Price`/`CurrencyProvider` (client-side currency, no request headers — kept), `AffiliateLink` + `wrapEbayAffiliateUrl` + `lib/affiliateSurfaces.js` (closed EPN surface enum — unchanged), `lib/analytics/events.js` (no new events), `scripts/reportHomepageConversion.mjs` (present, not run — needs a PostHog personal key; not needed for a visual pilot).
- **Provider paths traced.** Homepage SSR (`lib/deals.js`) imports Supabase + pure libs only — no PokemonPriceTracker / eBay import, so rendering `/` (all filters, page N) makes no paid call. The ONE homepage path that can reach a paid provider is the hero autocomplete `GET /api/card-search` (imports `getRawPrice`/`getRawPriceHistory` from `lib/pokemonPriceTracker`): every verification run blocked it at the network layer and typed nothing into a search box. `/api/rates` (FX + geo, not a pricing provider) was blocked too. Card-detail / `/search` routes were never requested. No static build was run (a `next build` prerenders `/deals/<category>` from the DB only; `/cards` `generateStaticParams` is `[]`).
- **Data limit found, not "fixed":** `deals.shipping` is `0` both for free shipping and when eBay stated no shipping option (`lib/ebay.js` `?? 0`). The UI therefore never says "free" — it says "no shipping charge listed". A true unknown-shipping state needs a scanner field, which a layout change does not authorise.
- Baseline captures (current homepage, dev server, isolated Chrome, allow-list): `BASE-home-{1280,390}(-fold).png`, `BASE-record.json` — 9 H2, 8 tracked sections, 22 sponsored links across four grids, 121 unique internal links, page 7615 px (desktop) / 18343 px (390), 0 overflow, 2 Next dev LCP warnings (pre-existing).

### R1 — premium component foundation — DONE (built locally)
- Tokens: `--radius-control`, `--color-accent`, `--color-positive`; global `prefers-reduced-motion` rule. Spacing stays Tailwind's 4px scale.
- Header = Deals ▾ · Cards & Sets ▾ · Guides & Research, region + search as utilities; every previous destination kept in a labelled submenu (dropdown links in the server HTML). Learn links → mobile menu + footer. Footer grouped (Deals / Cards & Sets / Learn / Follow) from the same model; the SEO-GSC-2 "Browse the catalogue" row, disclosure and verified social links unchanged in substance.
- DealCard contract: identity (2-line 16px name, set link, language, condition or grader+grade — "Condition not verified" in amber, never a NM default) · ONE dominant price ("Listing total", incl. recorded shipping or "no shipping charge listed"; auctions via `AuctionPrice` = current bid / shipping / est. total) · comparison only on a TRUSTED claim ("Market reference X · <condition>" + "Save Y · N% below market"; plain listings show the reason) · status facts · 44px red "View deal on eBay" / "View auction on eBay" through the existing `AffiliateLink` + surface attribution · "Details" + the device-local save as subordinate actions. No struck-through anchor.
- `ReferenceOfferCard`: catalogue / reference-only state (dashed, labelled reference, "Find on eBay" search via `EbaySearchLink`, never $0, never a deal button).
- Component sheet `/dev/deal-states` (404 in production, noindex, unlinked, no data): renders every state through the REAL `listingPresentation` rules from labelled fixtures — compared BIN, insufficient comparison, listed-before-release, auction, graded, non-USD (GB), condition not verified, long name, reference-only, no reliable reference. Captures: `R1-dev-deal-states-{1280,390}(-fold).png`. States the sheet cannot show: expired/unavailable (display-gated upstream; R3 on the detail page), shipping unknown vs free (data limit above), destination eligibility (feed-level filter).

### R2 — deal-first homepage pilot — DONE (built locally) — FIRST OWNER DESIGN REVIEW PENDING
- Hierarchy: compact hero (heading, one line, search shortcut + examples + the 17B "Check a card's price" text link, live-count line) → **one feed** "Deals to explore": flagship row (`best_deals`, 4, ranked, premium gate, eager images) + diverse grid (`all_deals`, 9) + "Browse all live deals" → `/deals`; mode row of existing destinations (Buy it now · Auctions · Graded · Under $25 · Under $50 · Sealed · Japanese · Newest) with `start_here_clicked`; "More filters" = the full existing FilterBar collapsed at every width (rows in the DOM, nofollow'd); trust line beside the offers → returning-visitor strip → (email capture when enabled) → Explore (3 hubs, most-active cards, Popular Pokemon / Key sets) → Guides & research → How comparisons work + FAQ (FAQPage JSON-LD unchanged) with the coverage prose leading in. Filtered / sorted / page-2+ views keep the stable list + pagination.
- Kept unchanged: title/description/canonical/robots, Organization/WebSite/FAQPage/CollectionPage JSON-LD, lanes + gates + variety + rotation, `HOMEPAGE_SECTIONS`, the closed EPN enum, `MobileStickySearch`, `CardMemoryStrip`, `EmailCapture` gating, US-first defaults and client-side currency.
- Changed semantics, documented not hidden: `ending_soon` / `just_added` / `under_25` sections no longer render (their impressions stop; EPN surfaces `home_auction` / `home_just_added` are unused, not renamed); `discover_deals_clicked` stays declared but is no longer emitted.

### Verification (real runs, exit codes)
- `node --test "tests/scanner/*.test.mjs"`: **3042 tests, 3008 pass, 12 fail, exit 1** — the identical 12 fail on the untouched base `8b16321` (social/creative fixtures + P043 + SC4C6-16 + 13E.5A-22), none from this work. The runtime `tests/seo` suite (boots `next start`, samples `/cards/*` → paid provider) was deliberately NOT run; the two source-level `tests/seo` assertions this touched were updated in place.
- Dev-server runtime (isolated context, allow-list; `r2-functional.mjs` **16/16**): mode row = 8 existing destinations, "Buy it now" `aria-current`, `?`-links nofollow, chips ≥ 40px; 4 flagship + 9 grid offers, first offer within the first 1280×900 screen; every eBay link `rel="sponsored noopener noreferrer"` + `_blank`, exact `/itm/` target, EPN `customid` = `home_best` / `home_all`; primary CTAs 44px; More filters collapsed → click opens sort/country/listing/price; Tab order header → modes → first offer CTA (34 tabs) with a visible focus ring; `?sort=newest` = Filtered deals + pagination + Clear filters, canonical `/`; `?page=2` noindex,follow + self-canonical; `?maxPrice=1` = truthful empty state with recovery links, no dummy cards; mobile menu opens (focus → Close), groups Deals / Cards & Sets / More / Learn, 44px rows, Escape closes; 390: 0 overflow, 342px cards, 16px name / 24px price / 44px CTA; dark mode (prefers-color-scheme) dark surfaces + light text; 320: 0 overflow after the header fix.
- Captures inspected: `R2-home-{1280,1440,390,320}(-fold).png`, `R2F-01` (filters open), `R2F-02` (empty state), `R2F-03` (mobile menu), `R2F-04/05` (dark 390 / 1280). Page height 7615 → 5200 px (desktop), 18343 → 13961 px (390). H2 9 → 5; tracked sections 8 → 5; sponsored links 22 → 13.
- Unique internal links 121 → 105: the 16 dropped are the removed lanes' 9 rotating `/deals/<id>` links, 4 `/cards/` + 2 `/sets/` links those cards carried, and the nofollow'd `/?listing=AUCTION&sort=ending` filter URL. No static destination lost (every hub, category, guide and trust page remains linked; sitemaps enumerate every deal/card/set directly).
- Console: only the pre-existing Next dev "LCP image / loading=eager" warning (also on the baseline); 0 errors, 0 failed requests; 0 requests to `/api/card-search`, `/cards/*`, `/search` or any provider/eBay host.
- Evidence files (local, not committed): `C:\Users\James\.claude\jobs\b4b590ce\tmp\{baseline-home,r2-functional}.mjs`, `tmp\shots\{BASE,R1,R2,R2F}-*`.

### Evidence limits / untested
- Safari / iOS and Firefox not exercised (Chrome headless only); no real device; no physical print. Dark mode checked in Chrome emulation only.
- Buyer comprehension (price / shipping / condition), preference and any sales effect are NOT measured — this is a layout pilot. The comparison-comprehension task check and the moderated evaluation from the brief remain to be run with fixture data.
- `scripts/reportHomepageConversion.mjs` baseline not gathered (no PostHog personal key in this session); EPN reports not read.
- The live-HTML `tests/seo` runtime suite was not executed (provider-safe execution needs a fixture / provider-disable mechanism this repo does not yet have for card pages).
- Not touched: listing detail, card pages, set/species, directories, guides (R3–R5). `SpeciesCard` / `CatalogueBrowser` / `SealedDealCard` still carry their older tile styling and "View on eBay" / "Bid on eBay" wording — they are the next slices.

### Next — R3 (after homepage design review)
Listing detail + permanent card pages on the approved system: trace their provider / cache / affiliate / expiry contracts first; add an offline / provider-disabled fixture path so the raw / graded / auction / no-reference / shipping-unknown / expired states can be rendered without paid calls; identity + price + eBay action first; preserve URLs, metadata, schema and no-sale fallbacks. Separate commits, 1280/390 captures, untested areas stated. No push or deployment from this slice.

**Status vocabulary:** R0 done · R1 built locally · R2 built locally (review pending) · R3–R7 not started. Nothing here is deployed or measured as a sales improvement.

### Revision after the first review (2026-09-13, still built locally, not deployed)

Owner review asked for: the actual revised homepage (labelled baseline vs revised), a compact mobile offer card, matched fixture artwork with simulated prices labelled, unambiguous shipping, the measurement impact documented, and the worktree's phantom modifications resolved. Commits (on top of `dc55e30`):

| Commit | Scope |
| --- | --- |
| `2dd5231` | `components/DealCard.js`, `components/AuctionPrice.js`, pinned tests |
| `aaef1bf` | `lib/dev/dealStateFixtures.js`, `app/dev/deal-states/page.js`, `tests/scanner/deal-first-r1.test.mjs` |
| `279f4d3` | `docs/deal-first-measurement.md` |
| (this commit) | this section |

**Shipping / savings.** `deals.shipping = 0` cannot distinguish free from unstated (`lib/ebay.js` `?? 0`). The card now headlines **"Listing price"** with **"Shipping not confirmed"** (amber) in that case, and only "Listing total · incl. $X shipping" when a charge was recorded. The derived saving reads **"Save $Y before shipping · N% below market"** whenever shipping is unconfirmed, so it never implies a verified delivered saving. `AuctionPrice` says "Shipping not confirmed" instead of "Free shipping" (deal detail page inherits this). Nothing in the discount computation changed - the qualification still compares the stored landed total (`total_price`) to the reference; the presentation just stops calling that figure delivered.

**Compact mobile card.** One DOM, two shapes: below `sm` a two-column grid - 4:5 artwork (object-contain, never cropped) at 7.25rem beside identity / price / comparison / status, with the 44px "View deal on eBay" spanning the card beneath (measured 342×309 css px at 390 for a compared listing, vs ~700 px stacked before). From `sm` the card stacks with a 4:5 artwork box (was square) and tighter padding, which removes most of the desktop whitespace around portrait scans. Name 16px, price 24px, meta 12px, CTA 44px.

**Fixtures.** Every fixture's artwork is now the real catalogue art of the printing it names (ids from the site's own checklists / guide registry: Clefable 45120, Snorlax 45122, Scyther 45121, Pinsir 45135, Cubone 45153, Dark Gengar 84599, Light Dragonite 86738, Charizard 42382, Umbreon VMAX alt art 246723, Zekrom ex 166/086 642618 from the SV: Black Bolt set page). The unreleased "listed before release" fixture carries no id and shows the neutral no-image state on purpose. Every sheet card carries a "Simulated offer · prices, dates and links are placeholders" label. A new `bin_shipping_unconfirmed` fixture shows the shipping-unconfirmed wording on a compared listing.

**Measurement.** `docs/deal-first-measurement.md` lists exactly which events / surfaces stopped (`homepage_section_impression` for `ending_soon` / `just_added` / `under_25`, their `deal_card_impression`s and lane clicks, `affiliate_click` origin sections `home_ending` / `home_fresh` / `home_under25`, EPN `home_auction` / `home_just_added`, `discover_deals_clicked`; `start_here_clicked` now `{section: feed_modes}` with eight chips), how the feed is measured (best_deals reach + selection, all_deals section → affiliate_click, page-level outbound per `page_view`, EPN `home_best` + `home_all`), and why lane-level rates before/after are different populations that must not be compared directly. A pre-change baseline read of `scripts/reportHomepageConversion.mjs` is still owed before any deploy.

**Worktree phantoms - root cause and worktree-scoped fix.** `git worktree add` ran under the machine-wide `core.autocrlf=true`, so every text file was checked out CRLF and the index recorded the CRLF **size**. After the files were normalised to LF for the static tests, `git status` / `git diff-files` reported ~1,000 files modified: `ie_modified` short-circuits on a size mismatch (`ce_stat_data.sd_size != 0`) without hashing, while `git diff` (which hashes) showed nothing. Fix, scoped to this worktree's own index and touching no Git configuration: `git -c core.autocrlf=false read-tree HEAD && git -c core.autocrlf=false update-index --refresh` rebuilt the stat data from the LF files. **Exact remaining diff after the fix and before this revision: none** (`git status --porcelain` empty apart from the untracked `.env.local` copy); after this revision it listed only the files in the table above. Global and repo Git settings unchanged; the dirty main tree untouched.

**Verification.** Scanner suite **3043 tests, 3031 pass, 12 fail** - the same 12 pre-existing on the base. Runtime `r2-functional.mjs` **16/16** on the revised feed (outbound links sponsored / exact `/itm/` / `customid` home_best·home_all, keyboard, filters, filtered/paged/empty views, mobile menu, dark, 390 and 320 without overflow). Captures: `BASELINE-home-{1280,390}-{first-screen,full}.png` (pre-change homepage), `REVISED-home-{1280,390}(-fold).png`, `REVISED-home-390-card.png` (one clipped mobile offer), `R1v2-dev-deal-states-{1280,390}.png` (sheet). Unique internal links 121 → 109; the only non-rotating link dropped is the nofollow'd `/?listing=AUCTION&sort=ending` filter URL - every static destination is still linked. Console: the pre-existing Next dev LCP warning only.

**Remaining limitations.** Unknown-vs-free shipping stays a data limit until a scanner field exists (out of scope for a layout change). `SpeciesCard` / `CatalogueBrowser` / `SealedDealCard` keep the older tile and "View on eBay" / "Bid on eBay" wording (R3-R5). Safari/iOS/Firefox and real devices not exercised; buyer comprehension not measured; PostHog/EPN baselines not read. Status: R2 built locally, revised, awaiting review; R3 not started.

### Independent review round 1 (Codex, 2026-09-13, on `fe7a535` vs `8b16321`) — five findings, all confirmed and fixed (built locally, not deployed)

Codex is attached to this session as the sole coordinator / reviewer (owner-authorised); Claude is the sole implementation writer, launches no reviewer of its own, reviews completed commits only and stops editing between rounds. Each finding was verified against the source before anything changed.

| Commit | Finding | Verdict | What changed |
| --- | --- | --- | --- |
| `6cf3ee8` | **P1** price / shipping stripped by the cache projection | **Confirmed - regression (R1) + pre-existing (INFRA-DB-1)** | `lib/dealPoolShape.mjs` `POOL_ROW_FIELDS` had dropped `price` and `shipping` (INFRA-DB-1's slim projection), so every card rendered from the cached pool read shipping as unknown: the R1 DealCard labelled **every** fixed-price offer "Listing price / Shipping not confirmed / Save … before shipping" even where the scan recorded a charge (regression introduced by R1's wording), and `AuctionPrice` had been falling back to the landed-total estimate instead of the split current-bid rendering since INFRA-DB-1 (pre-existing, surfaced by this review). Fix: the two fields are back in the projection and the select; cache keys bumped `deals-pool-v2 → v3`, `homepage-lanes-v2 → v3` so entries written in the old shape are never served to the new card (a row that still lacks the field resolves to `unknown` → "Listing total" + "Shipping not confirmed", never "free", never "Listing price" for a figure that may include a charge); new `lib/offerPresentation.js` is the ONE shipping contract (confirmed = charge recorded → "Listing total · incl. $X shipping", unqualified saving; unconfirmed = 0 recorded → "Listing price", "Shipping not confirmed", "Save … before shipping"; unknown = field absent). |
| `2aa29d2` | **P2** "Buy it now" labelled a mixed feed | **Confirmed** | The default feed is the BIN flagship row + a diverse grid that may contain auctions. The first chip and the kicker now say **"Featured"** (`chip: featured`, `aria-current` at `/`); "Buy it now" is the existing `?listing=FIXED_PRICE` filter. |
| `2aa29d2` | **P3** hidden lanes still reserved printings in dedupe | **Confirmed** | `buildHomepageLanes(pools, { lanes })` - the caller lists the lanes it renders; unlisted lanes return `[]` and take part in no cross-lane dedupe. `app/page.js` passes `["flagship", "grid"]`. Omitted → every lane exactly as before; `LANES()` contract and other callers unchanged. |
| `3d6177d` | **P4** desktop `graded_clicked` lost | **Confirmed** (desktop lost in R1; mobile never emitted it) | The event + props live on the `NAV_PRIMARY` entry; header inline entries, `NavDropdown`, `NavMenu` and the footer "Deals" column all emit the model's marker (footer adds `source: "footer"`), exactly once per click; `AnalyticsBootstrap` adds no second event because the marker already is `graded_clicked`. Side effect, documented: `graded_clicked` and `latest_releases_clicked` now also fire from the mobile menu and the footer. |
| `476a91f` | **P5** measurement doc confused attribution fields | **Confirmed** | The doc had listed DealCard pageNames (`home_ending` / `home_fresh` / `home_under25`) as PostHog `origin_section` values. Corrected to the three real vocabularies: `origin_section` (`ending_soon` / `just_added` / `under_25` stopped; `best_deals`, `home_all_deals` continue), Vercel "eBay Click" `page` (`home_ending` / `home_fresh` / `home_under25` stopped; `home_best`, `home_all_deals` continue), EPN `customid` (`home_auction` / `home_just_added` unused; the under-$25 lane was never mapped and sat in `other`). Historical → current mapping per stream, sums only. |
| `6cf3ee8` | **AuctionPrice unknown-shipping limitation** | **Narrow: pre-existing data limit, wording tightened** | With `price` back in the row the split rendering is used again (current bid / shipping / est. total). A recorded `0` now reads "Shipping not confirmed" (amber) with **"Est. total before shipping"**; a recorded charge keeps "Est. total". The no-bid fallback (no `price` stored) is unchanged: an estimate, never labelled "Current bid". Free-vs-unstated remains indistinguishable until a scanner field exists (unchanged scope). |
| `1be38b4` | regression coverage | - | `tests/scanner/deal-first-review-fixes.test.mjs`: rows go through `slimPoolRow` (the real projection) before the display contract reads them - recorded charge, 0, legacy row without the field; auction split from the slim row; `lanes` selection; feed label; graded event on the model; the doc's values. |
| `18c4135` | coordinator follow-up (round 1 notes) | - | Measurement doc: **nine** mode chips (featured, buy_it_now, auctions, graded, under_25, under_50, sealed, japanese, newest - not eight); new rows for the `graded_clicked` / `latest_releases_clicked` mobile-menu + footer populations (split by `source` and device before comparing with the pre-R1 desktop-only series); tests for projection edge rows (DB `null` shipping → unknown; GB listing keeps native shipping + `GBP`; strings / NaN / negative never confirm), the AuctionPrice no-bid fallback, a GB auction split, footer/menu prop shape, and the doc's mode count pinned to the page's chip list. |

**Verification (real runs).**
- Affected suites run sequentially, fail-fast (stop at the first failing suite): deal-first-review-fixes 14/14, infra-db-1 13/13, homepage-variety-p041 21/21, latest-releases-17c8 12/12, homepage-hierarchy 12/12, deal-first-r1 10/10, mobile-discovery 11/11, analytics-homepage-13c5 8/8, homepage-browse-conversion-uxcvr2 12/12, auction-price-integrity 22/22, seo-17b-foundation 17/17 - all green. Stale pins updated to the shared contract (deal-first-r1 R1-4, mobile-discovery, auction-price-integrity 2c, uxcvr2-9, latest-releases H-8, homepage-hierarchy).
- Full `node --test "tests/scanner/*.test.mjs"` at `18c4135`: **3057 tests, 3023 pass, 12 fail, exit 1** - the identical 12 pre-existing failures on the untouched base `8b16321` (social/creative fixtures, P043, SC4C6-16, 13E.5A-22); none from this work. Runtime `tests/seo` deliberately not run (samples `/cards/*` → paid provider).
- Dev-server runtime at `1be38b4` (no UI file changed after it), isolated Chrome context, allow-list (`/api/card-search`, `/api/rates`, `/cards/*`, `/search`, tracking hosts blocked at the network; 0 requests reached a provider or eBay host): `r2-functional.mjs` **16/16** with nine modes and "Featured" current; rendered homepage = 13 offers: **2 confirmed** ("Listing total $57.04 · incl. $6.80 shipping · Save $45.85 · 45% below market" and "Listing total C$135.72 · incl. C$42.26 shipping"), 10 unconfirmed BIN ("Listing price", "Shipping not confirmed", saving "before shipping"), 1 auction ("Current bid $50.00", "Shipping not confirmed", "Est. total before shipping"); 0 "free shipping" strings; 2 `graded_clicked` markers in the server HTML (dropdown + mobile menu) plus the footer's; 0 console errors, only the pre-existing Next dev LCP warning; 0 failed non-blocked requests.
- Captures (local, not committed, `C:\Users\James\.claude\jobs\b4b590ce\tmp\shots\`): `FIXED-home-1280-fold.png`, `FIXED-home-1280.png` (full, 5518 px), `FIXED-home-390-fold.png`, `FIXED-home-390.png` (full, 9907 px), `FIXED-home-1280-card.png` / `FIXED-home-390-card.png` (the confirmed-shipping Jirachi offer, desktop and two-column mobile shape), `FIXED-sheet-dev-deal-states-{1280,390}(-fold).png` (component sheet, 11 states). Earlier `BASELINE-*` / `REVISED-*` captures remain for comparison.

**Notes for the visual review (not changed here).** (1) At 1280×900 the first screen shows the hero, the mode row and the top of the four flagship artworks; prices and CTAs sit just below the fold (page as captured, `FIXED-home-1280-fold.png`) - a design decision for the owner, not a technical defect. (2) At 390 the identity line "Set · Condition" in the two-column card is a single truncating line; on long set names the condition is cut with an ellipsis (probe: two spans past the viewport inside an `overflow-hidden` parent, page `scrollWidth` 390, so no horizontal scroll). Present in the previous revised build too (three such spans then), so not a regression from these fixes; a compared listing repeats the condition on its "Market reference" line, a plain listing does not. (3) The dev-only Next "N" badge appears in captures; it is not product UI.

**Constraints held.** No push, deploy, paid pricing-provider call, DB write, scanner / cron change, outreach or social action; Stage B suspended; `.env.local` present in the worktree only as the git-ignored copy; dirty main tree and the `collector-number-search` / `analytics-runtime-verify` branches untouched; no Codex runner launched from this session (coordinator instruction supersedes the earlier runner request - the CLI facts gathered for it are in the phase memory). R3 not started.

### Independent review round 2 (Codex, 2026-09-13, on `75df13c`) — confirmed and fixed (built locally, not deployed)

| Commit | Finding | Verdict | What changed |
| --- | --- | --- | --- |
| `bc1382b` | **(1)** `offerShipping` treated a null / missing breakdown as "Listing total" and allowed a "before shipping" saving from `total_price`, which may already include a charge | **Confirmed** | `unknown` now renders the neutral **"Recorded price"** (BIN) / **"Recorded total"** (auction), **"Shipping breakdown not recorded"**, and `savingClaim: "none"`: DealCard shows no badge, no "Save …", no "% below market" and reports `discount_band: no_savings_claim`; the market reference is still shown with "No saving stated: shipping breakdown not recorded". Zero stays explicitly **unconfirmed** ("Listing price", "Shipping not confirmed", saving "before shipping"); a recorded charge stays **confirmed** ("Listing total · incl. X shipping", unqualified saving). |
| `bc1382b` | **(2)** `AuctionPrice`: the no-bid fallback said "Est. total" + "% under market ref" with no shipping state; the normal branch collapsed a missing shipping figure to 0 and called the stored total "before shipping" | **Confirmed** | The component reads the state from the shared contract, not from `auctionDisplayParts` (which still collapses to 0 for arithmetic only). Confirmed → "Est. total" + delivered comparison; 0 → "Est. total before shipping" and "% under the market reference **before shipping**"; unknown → "Recorded total", "Shipping breakdown not recorded", **no comparison stated**. The fallback uses the same labels, shows "incl. X shipping" when a charge was recorded, and never says "Current bid" or an unconditional "Est. total". |
| `bc1382b` | **R1 acceptance: condition hidden by truncation** (coordinator, from the saved 390 probe: a long set name truncated the only condition label on a plain offer) | **Confirmed** | The set · condition line is now `flex flex-wrap`: the **set** span truncates (`min-w-0 max-w-full truncate`), the **condition / grade** span never shrinks or truncates (`shrink-0 whitespace-nowrap`, `data-condition`) and wraps to its own line at 390 / 320 when needed. Compact card kept (342×284 css px at 390, 272×337 at 320 for the long-set plain fixture). Hero untouched. |
| `78e97c1` | **Measurement doc: "reach ≈ homepage views"** | **Confirmed (unsupported inference)** | Section-impression semantics stated from `HomepageAnalytics`: fires once the wrapper intersects with ≥ half of min(section height, viewport height) visible; it does NOT mean a price or eBay button was seen. Saved captures: at 1280×900 the first screen ends at the top of the flagship artwork; at 390 no offer is in the first screen. Recorded as an explicit **R2 owner-review limitation** (first-screen offer completeness is the owner's decision). |
| `78e97c1` | **Nav-population distinction** | **Corrected** | `graded_clicked` gained mobile-menu AND footer populations; `latest_releases_clicked` was already emitted by the base mobile menu (base `NAV_PRIMARY` + `NavMenu`), so only its footer population is new. |

**Regression coverage** (`tests/scanner/deal-first-review-fixes.test.mjs`, now 19 tests): P1-4 / P1-4b re-pinned to the round-2 contract (unknown → "Recorded price", note, claim none; DB `null` → unknown; GB native currency; strings / NaN / negative never confirm); R2-1 DealCard gates (badge, Save line, band); R2-2 AuctionPrice reads the contract, both branches label the total from it and qualify the percent, unknown states no comparison, fallback never "Current bid"; R2-3 the five new sheet fixtures reach their states through the real rules; R2-4 the doc's impression semantics and limitation; R2-5 the set/condition line and the long-set plain fixture. `deal-first-r1` R1-5 / R1-6 and `mobile-discovery` re-pinned.

**Verification (real runs).** Affected suites sequential, fail-fast: deal-first-review-fixes 19/19, deal-first-r1 10/10, mobile-discovery 11/11, auction-price-integrity 22/22, auction-lane-ranking 16/16, deal-image-integrity 30/30, infra-db-1 13/13, analytics-homepage-13c5 8/8, preorder-guard-17c7 7/7, homepage-hierarchy 12/12, `tests/seo/currency-display` green. Full `node --test "tests/scanner/*.test.mjs"` at `bc1382b`: **3062 tests, 3028 pass, 12 fail, exit 1 - the suite remains failing** with the identical 12 pre-existing names on the base (`8b16321`); none from this work. `tests/seo/conversion-ux` is a runtime suite (fetches `localhost:3000`): it fails identically (18/18 `ECONNREFUSED`) on the committed tree and on this change without a server, and was not run against a server (paid `/cards/*` sampling). Dev-server runtime (isolated context, allow-list, 0 provider / eBay requests, 0 failed non-blocked requests): homepage 13 offers = 2 confirmed / 10 unconfirmed BIN / 1 unconfirmed auction (now "Est. total before shipping $50.00 vs market ref $83.57 · 40% under the market reference before shipping"); 0 unknown-breakdown rows on the live pool (every stored row has the field after P1), so the unknown wording is exercised on the dev sheet only; 0 "free shipping" strings; 1280 / 390 / 320: `overflowX` 0.

**Captures** (`C:\Users\James\.claude\jobs\b4b590ce\tmp\shots\`): `R2S-bin_shipping_unknown-dev-deal-states-{1280,390}-card.png` (Recorded price · breakdown not recorded · no saving stated · no badge), `R2S-auction_shipping_unconfirmed-…-card.png` (Shipping not confirmed · Est. total before shipping · "% under the market reference before shipping"), `R2S-auction_shipping_unknown-…-card.png` (Recorded total · no comparison stated · no badge), `R2S-auction_no_bid-…-card.png` (fallback: Est. total · incl. $6.00 shipping · never "Current bid"), `R2S-bin_plain_long_set-dev-deal-states-{390,320}-card.png` (long set + amber "Condition not verified" on its own line), `R2S-long_name-…-{390,320}-card.png`, `R2C-home-home-{1280,390,320}(-fold|-card).png` (homepage after the identity-line change; the 320 card shows "EX Dragon Frontiers" with "· Lightly Played" wrapped beneath), `R2S-sheet-dev-deal-states-1280(-fold).png` (full sheet, 16 cards).

**Still open for the owner (not changed).** First-screen offer completeness at 1280×900 and 390 (hero + mode row occupy the first screen; prices / CTAs below the fold) - a design decision, recorded in the measurement doc as the R2 owner-review limitation. Free-vs-unstated shipping remains a scanner data limit. Status: R2 built locally, review round 2 fixed; R3 not started.

**Independent review closed (Codex, 2026-09-13) on the clean commit `9c402167f06f629ea337db17cdfc5de9ea335512`.** The five round-1 findings and the round-2 shipping / condition / doc findings were closed within the inspected scope; no further code change was requested. The reviewer independently ran six suites (deal-first-review-fixes, auction-price-integrity, infra-db-1, homepage-variety-p041, deal-first-r1, checklist-progress-17c11): **104/104, exit 0**; compared the full-suite logs (ANSI stripped) against the base run: the **same 12 distinct failure names**, so the full scanner suite **remains failing** (3028 pass / 12 fail / 22 skipped) exactly as on `8b16321`; and viewed the R2C desktop / mobile fold + card captures and the R2S unknown-BIN / unknown-auction / fallback / long-set-320 captures. Application code is unchanged from `9c40216`; this paragraph is the only later change. **Not deployed.**

**Review workflow demonstrated (local).** Claude implementation → Codex independent review → Claude verification and correction in separate commits → Codex re-review, twice, on completed commits only: round 1 on `fe7a535` (five findings, fixed `6cf3ee8` … `18c4135`, ledger `75df13c`), round 2 on `75df13c` (shipping / condition / doc findings, fixed `78e97c1` + `bc1382b`, ledger `9c40216`), closed on `9c40216`. Codex ran as the existing subscription-authenticated (ChatGPT login) session attached to this Claude session as the sole coordinator / reviewer; no review runner, API-key billing, recursive reviewer or second coordinator was created; Codex modified no application file; Claude paused editing while each reviewed commit was read; review artifacts (logs, captures) stayed local and uncommitted.

**Explicit limits of this slice.** No fresh checklist browser validation, physical print or cross-browser (Safari / iOS / Firefox / real device) validation was run in these rounds; no production analytics ingestion was verified (PostHog / Vercel / EPN reads not performed - `scripts/reportHomepageConversion.mjs` baseline still owed before any deploy); unknown-vs-free shipping remains a scanner data limit (a recorded 0 is "not confirmed", never "free"); the full scanner suite remains failing with the 12 pre-existing base failures.

**Gates.** Editing on `deal-first-r0r2` is PAUSED at this commit. The owner's visual decision on a complete first-screen offer (artwork + price + action at 1280×900 and 390) is PENDING. R3 (listing detail + card pages) and every production action (push, deploy, paid pricing-provider call, DB write, scanner / cron change) are GATED on the owner. Unchanged standing items: the 19 September GSC discovery re-check stays a note (not an automation); Stage B remains OWNER_SUSPENDED; outreach parked.

### Owner-approved acceptance clarifications and premium brand direction (2026-09-13)

These clarifications supplement the supplied 15-page Deal-First Overhaul PDF, especially pages 5-12, within this existing overhaul entry. James authorised adding the plan audit recommendations and explicitly required a premium website with the design quality of a high-class brand. They do not create a second roadmap or approve R3-R7, production actions or suspended work.

**Current handoff.** HEAD remains `9afb861884430fb0f82b136229e8069a6971d881`. James authorised the next bounded R2 refinement: shorten the hero and improve complete-offer visibility. Claude started it, then became usage-limited (owner reports reset at 11:20am); the job reports blocked with zero active tasks. Uncommitted implementation work is preserved in `app/page.js`, `components/DealCard.js` and `tests/scanner/homepage-browse-conversion-uxcvr2.test.mjs`. This supersedes the earlier clean-tree/paused status for the current working tree; it does not invalidate the prior committed review. Codex owns this documentation-only update while Claude is blocked. Claude remains the implementation writer when resumed; Codex independently reviews completed commits. No automatic restart is scheduled.

**Premium brand acceptance, separate from technical correctness.** The experience must look deliberately art-directed and polished, with a recognisable Pokemon Deal Finder identity. Preserve restrained red/white branding and real, unaltered card artwork. Use a consistent typographic hierarchy, readable prices, intentional spacing, aligned card content, proportional image framing, quiet borders and restrained shadows. Give primary actions clear emphasis without making every badge, link and control compete. Navigation, filters, empty states, footer and mobile layouts must receive the same finish as the hero. Judge complete desktop and mobile compositions, including supported dark mode, rather than isolated attractive cards. Avoid cramped layouts, arbitrary style changes, excessive badges and a generic template appearance. Brand quality, task clarity and truthful commercial information are coequal criteria; neither a passing test nor a first-screen geometry result establishes visual approval.

| Acceptance clarification | Required evidence / decision |
| --- | --- |
| 1. Explicit shipping and auction state contract (PDF pp. 6-7) | Distinguish recorded positive shipping, ambiguous zero, missing/null breakdown and missing auction bid. Test real cache projection and stale/missing-field rows, not only complete fixtures. Unknown breakdown must not turn a stored total into an asserted item price or unsupported savings claim. Retain the reviewed R1-R2 fixes; verify preservation through further layout changes. |
| 2. Complete-offer visibility with a readability floor (pp. 5-6) | Inspect identity, artwork, main price, shipping/comparison and eBay action together at 1280x900, 1440x900, 390x844 and 320x800. Record actual CTA/card geometry plus screenshots. Aim for a complete first offer on ordinary desktop/390 layouts; at 320 or unusually long states, modest scrolling is preferable to clipped condition, tiny text or compressed artwork. Do not treat this as a universal above-the-fold guarantee. Preserve comfortable 44px intended tap targets and premium spacing. |
| 3. Recorded comprehension check (pp. 5, 7) | Use an answer sheet for listing amount, shipping treatment, reference condition, currency, auction status and action destination. Include ambiguous shipping, mismatched condition, reference-only and auction examples. Record misunderstandings and resulting fixes. A mistaken delivered-price or guaranteed-saving interpretation requires review. Distinguish developer checks from prospective-user evaluation; recruitment/outreach is not authorised here. |
| 4. Combined edge states (pp. 7, 11-12) | Cover long identity + non-USD + unknown shipping at 320; auction + missing bid/shipping; plain offer + long set + unknown condition; sparse inventory + active filters; keyboard navigation through horizontally scrolling mobile modes. Preserve full essential information and existing quality gates. Test relevant combinations with provider-safe fixtures instead of an indiscriminate whole-site suite. |
| 5. Reproducible visual evidence (pp. 2-3, 12) | Record commit, clean/dirty status, fixture/data snapshot, viewport, theme, currency and capture time. Use the same offers for baseline/revised layout comparisons; label real-data captures separately. Draft captures from uncommitted code are exploratory evidence, not final commit verification. Save complete error/request classifications with runtime evidence. |
| 6. Performance and recovery (pp. 10-12) | Compare image/currency loading movement and existing performance/cache budgets against baseline. Exercise slow/failed images, unavailable data and back-navigation context on safe paths. Verify supported loading, empty and error states with keyboard/focus behaviour. Do not introduce provider calls, caching changes or new infrastructure to satisfy a cosmetic check. |
| 7. Evidence-based phase and release status (pp. 10-13) | Each applicable criterion gets passed, failed, unverified or not-applicable status with a reason and evidence reference. Track implemented, independently reviewed, owner visually approved and deployed separately. Identify the rollback target and stop conditions before any later authorised release. Baseline failures remain failures; unavailable evidence is never approval. |

**Draft evidence assessed, not accepted.** Saved `tmp/shots/FOLD2-record.json` and matching screenshots show the complete first offer at 1280x900 and 1440x900 (CTA bottom 843px) and 390x844 (809px). At 320x800 the CTA bottom is 857px, below the first screen. Codex inspected the 1280, 390 and 320 pixels. These captures belong to unfinished work, not the reviewed HEAD, and demonstrate neither final functional correctness nor premium owner approval. Horizontal mobile modes and relocated filters/tracking still require verification.

**Next bounded task.** When Claude resumes, reconcile these instructions with its preserved edits, finish the R2 refinement without sacrificing readability or brand quality, verify relevant combined states and relocated navigation/filter/measurement behaviour, capture the final implementation, update this ledger, commit and pause for independent review. Use no more than three review/fix rounds for this bounded task. Record all remaining evidence limits. R2 owner visual approval is still required before R3.

**Standing boundaries unchanged.** No production push/deployment, paid pricing-provider calls, DB writes, scanner/cron changes, email activation, outreach or social publishing. Keep the dirty main tree and unrelated branches untouched. Preserve SEO, EPN attribution, checklist/storage/print functionality and 17C.12 provenance. Stage B remains OWNER_SUSPENDED; original research remains queued; the 19 September 2026 GSC review remains a note, not an automation.

### Extended source and saved-evidence audit while Claude is blocked (2026-09-13)

Owner requested an audit of everything while waiting. Scope: the PDF/acceptance contract, R1-R2 committed changes and clearly separated draft diff, shared navigation, pricing/affiliate/currency paths, checklist/storage/print, representative listing/sealed/species templates, and guide/research/SEO/sitemap source. This is a broad source audit, not an exhaustive security audit or fresh whole-site runtime verification. Application HEAD remains `9afb861`; no application files were edited. Claude's three unfinished files are preserved. Production, provider, scanner/cron and account state were not exercised.

**Additional findings (open; no automatic expansion of implementation scope):**

| ID / priority | Finding and evidence | Origin / disposition |
| --- | --- | --- |
| AUD-01 / P2 | Checklist write-failure fallback loses the current interaction when reads still work. `lib/checklistStorage.js:61-64,75-90` reads memory only if getItem throws, while a failed setItem stores the new marks only in memory. An isolated Node probe with a fake in-memory localStorage whose reads succeed and writes throw returned before=[old], persisted=false, after=[old] after toggling new. Expected current-page state includes new even though persistence failed. No actual browser storage was touched. | Pre-existing; module unchanged from redesign base. Narrow collector reliability fix to queue explicitly; preserve keys and exact unsaved warning. Existing checklist pure tests did not cover this partial-storage-failure case. |
| AUD-02 / P2 | Listing JSON-LD asserts a zero shipping rate for ambiguous/missing shipping: `app/deals/[id]/page.js:504-508` uses Number(deal.shipping ?? 0).toFixed(2). `lib/ebay.js:123,473-482` establishes that unstated shipping also becomes zero. The new card wording does not correct this separate structured-data assertion. | Pre-existing listing-page code, not introduced by the R2 draft. Track for a separately bounded truthful-schema correction / R3 prerequisite. Omit unsupported shipping claims; no scanner change is needed to stop asserting them. Source-confirmed; production HTML not fetched. |
| AUD-03 / P2 | Menu focus contract is incomplete. `components/NavMenu.js:18-29,69` opens an aria-modal dialog and focuses Close, but implements neither keyboard focus containment nor return to the opener on dismissal. `components/NavDropdown.js:74-75` closes on Escape without returning focus from a hidden submenu item to its trigger. | R1 acceptance gap; mobile modal semantics/initial focus were added in R1, while missing containment existed in the earlier overlay. Source-confirmed missing mechanisms; current browser Tab/Shift-Tab/Escape reproduction still required before acceptance. Fix as a bounded shared-navigation task. |
| AUD-04 / P2 | The no-savings analytics correction is incomplete outside opted-in lanes. `components/DealCard.js:159` sets no_savings_claim in analyticsPayload, but its untracked-grid fallback at ~399 omits discount_band. `components/AffiliateLink.js:37` then derives a band from eventData.discountPct even when the UI suppresses the claim. A pure evaluation with origin_section=home_all_deals and discountPct=25 returned 15_30 despite visibleClaim=none. | Remaining R1-R2 integration issue missed in the prior scoped closeout. Pass the presentation-aware band on every DealCard affiliate path; verify handler payload without SDK transport. This is not an EPN URL corruption finding. |
| AUD-05 / P2 | Global checklist print selectors hide content on pages without a checklist. `app/globals.css:120-123` applies body > * > *:not(:has([data-checklist-print-root])) and main-child suppression to every printed page. A guide/research page without that marker therefore has its content matched by display:none. | Pre-existing 17C.11 rule, unchanged in the redesign except unrelated CSS additions. Source-confirmed selector scope defect; no fresh browser print/PDF produced in this audit. Scope checklist-only suppression to pages containing the print root and verify both checklist and ordinary article print. |
| AUD-06 / P2 | Shipping uncertainty remains undisclosed on older offer surfaces. `components/SpeciesCard.js:129-153` shows auction estimated total/under-market percentage without a shipping-state limitation; `components/SealedDealCard.js:118-146` retains fixed-price comparison rendering without the shared shipping presentation. Thus the corrected DealCard is not yet a site-wide truthfulness contract. | Pre-existing R4/R5 family backlog, not a claim that R2 introduced it. Include source data/projection and combined shipping states when those families are authorised; do not merely restyle them. |

**Draft-only completion requirements.** The shortened-hero draft removes HeroSearch's popular links (so `hero_suggestion_clicked` stops on that surface), hides search examples below sm (changes the `hero_example_clicked` population), puts mobile modes in a scrolling row, and relocates More filters below the flagship row. `docs/deal-first-measurement.md` still describes the earlier implementation; it must record these changes before the draft is accepted. Verify every mode by keyboard/touch and active-filter context, plus error/empty and back-navigation states. Draft screenshots are not final evidence. These are unfinished-task requirements, not findings against a completed revision.

**Premium visual review concerns (judgment, not runtime bugs).** The FOLD2 draft improves first-offer visibility, but rank/country/discount overlays, small supporting text and several competing controls still deserve deliberate visual review against James's high-class-brand requirement. The shared compact SaveCardButton remains 32x32 CSS px, below the PDF's preferred 44px design target (not described here as a standards violation). Review comfortable hit areas and coherent focus styling. Do not fix the 320px fold by shrinking essential text or hiding condition/shipping. No owner visual approval is inferred from the geometry.

**Checks completed.** Independently executed `node --test tests/scanner/set-reference-17c12.test.mjs tests/scanner/collector-number-prefixed.test.mjs tests/scanner/currency-integrity.test.mjs`: 45 tests, 45 passed, exit 0. Existing fixture tests preserve Jungle 64 / Neo Destiny 113 / Boundaries Crossed 153 reference-note contracts and prefixed-number identity/ambiguity handling; they do not verify today's production catalogue counts. The isolated storage probe and analytics calculation above reproduced their respective logic problems with no network or real storage writes. Reviewed affiliate href pass-through, sponsored rel and fixed surface mapping source; no new URL-wrapper defect found. SpeciesChecklist still uses the non-owned row renderer. Guide/research source retains dated-study/provenance distinctions. Sitemap/metadata source inspected; no fresh crawling/indexing assertion is made. The previously matched 12 full-scanner failures remain unresolved baseline failures; that suite was not redundantly rerun.

**Limits and next actions.** No live provider routes, production fetches, DB writes, builds, new servers, screenshot generation, real printing, cross-browser testing or production analytics transport/ingestion checks in this audit. Existing supplied screenshot pixels were inspected earlier; their limitations remain. Claude remains blocked; findings are durable here for its next context reconciliation. Separate R2 completion/shared-component fixes from pre-existing collector and later-family repairs. No fixes, new phase or deployment are authorised solely by this audit entry.

### Owner requirement: SEO is a strict release gate (2026-09-13)

James explicitly requires SEO to receive the highest level of care. Premium visual design must preserve the site's organic discovery and collector/research usefulness. This means evidenced technical acceptance, not a promise of perfect rankings, guaranteed indexing or traffic uplift. Keep the established US-first strategy and international support; do not infer an AU-first change.

Before any proposed rollout, reconcile the exact approved commit and route-family scope against these checks in this same ledger. Record passed / failed / unverified / not applicable with evidence. Source checks, local rendered output and production/GSC evidence are distinct. Unknown or failed required checks cannot be called passed.

| Gate | Required acceptance evidence |
| --- | --- |
| URL and status integrity | Preserve established routes and meaningful destinations; check intended redirects, missing URLs and expired offers. No accidental soft-404 states, redirect loops or new duplicate route systems. |
| Canonicals and indexability | Verify initial rendered canonical and robots output for representative home/category/card/set/species/editorial routes and filter, sort, search and pagination variants. Preserve the existing intentional policy; do not make every URL indexable or change pagination canonicals merely for consistency. |
| Crawlable discovery | Compare unique server-rendered destination sets and identities before/after. Explain removed rotating links separately from permanent discovery links. Retain real href anchors and useful catalogue/checklist/research paths; menus or client-only controls must not remove the only discovery route. |
| Sitemaps | Verify approved membership, canonical destinations, intended status/indexability and truthful lastmod from the existing mechanisms. Check relevant child sitemap output without broad or paid-provider crawling. |
| Truthful structured data | Match identity, condition, price/currency, availability and shipping to the available evidence and visible page. Do not manufacture optional fields to satisfy a validator. AUD-02 (unsupported zero shipping in listing JSON-LD) remains open and blocks an SEO-ready release sign-off until resolved and verified in an authorised bounded change. |
| Search-intent content | Preserve useful page-specific titles/descriptions, coherent headings, exact printing/language/unit distinctions and substantial catalogue/editorial answers. Keep dated research, methodology, citations and provenance intact; no keyword stuffing, fabricated freshness or unsupported claims. |
| Rendering and performance | Check useful initial HTML and hydrated output, image identity/alternative text where appropriate, responsive reflow and loading stability. Preserve cache/image/polling budgets. A build, source assertion or isolated screenshot alone is insufficient evidence. |
| Affiliate integrity | Preserve the established wrapper, actual destinations, attribution and sponsored qualification; test construction and handler behaviour without sending test affiliate traffic. |
| Release and observation | Require exact reviewed SHA, explicit deployment approval, a recorded rollback target and bounded post-release verification. Keep technical release checks separate from later indexing/performance observations and sales attribution. No production or GSC read is claimed without actual evidence. |

**Current state:** SEO acceptance is not complete. The source audit found AUD-02; fresh comprehensive rendered/production verification has not occurred. R2 draft link and measurement changes still require review. Do not describe the site as SEO-perfect or release-ready. Resolve cross-family items through bounded tasks without silently starting R3 or later phases.

**Preservation:** Original research remains queued and existing research pages retain their dated findings. The 19 September 2026 GSC review stays the recorded observation note, not a new automation. Stage B remains OWNER_SUSPENDED and outreach parked. No production push/deployment, paid provider call, DB write, scanner/cron change or unrelated cleanup is authorised by this requirement.

### Codex implementation takeover authorised (2026-09-13)

James authorised continuing upgrades without Claude while its subscription is limited. Codex is now the sole implementation writer for the current bounded R2 task. The supported command claude stop b4b590ce completed successfully, retaining its conversation and worktree and preventing a second writer from resuming automatically. Claude's draft plus the uncommitted ledger were backed up outside the worktree as ../codex-takeover-9afb861.patch before editing. The dirty main tree and unrelated branches remain untouched.

Scope: finish the shortened-hero R2 draft with premium/readable hierarchy, correct AUD-03 menu focus and AUD-04 grid analytics, verify safe local renders and focused tests, then commit and present evidence. AUD-01/02/05/06 remain separately tracked; this takeover does not begin R3, deploy, call paid providers or change scanner/DB state. Because Codex is implementing this slice, its own checks are not an independent second-agent review; Claude can independently review the resulting stable commit when available.

### R2 Codex takeover closeout (2026-09-13)

Implementation commit: a15bb51468f516b7fd225c27397878594295c7a5 on deal-first-r0r2, based on 9afb861884430fb0f82b136229e8069a6971d881. Preserved and completed Claude's compact-hero draft. Codex remains coordinator; Claude job b4b590ce is stopped, with its worktree/session retained. No second writer is active.

- Shortened hero and one horizontal mobile mode row bring offers forward. Desktop artwork uses a contained 6:5 box; card faces retain their proportions. Names/prices remain 16px/24px. Modes, save controls and primary actions have 44px targets.
- Removed the duplicate hero Most listed row; its card destinations remain in the six-card explore section. Search examples remain in initial HTML but are hidden on phones. Feed placement/exposure changes and discontinued hero_suggestion_clicked are documented in docs/deal-first-measurement.md section 5, separately from EPN attribution.
- AUD-03 corrected: mobile modal makes the background inert, contains keyboard focus and restores its opener; desktop Escape restores the dropdown trigger. AUD-04 corrected: ordinary-grid unknown-comparison cards now pass no_savings_claim through the actual affiliate handler, as opted-in lanes do.
- Hero/disclosure wording no longer promises every listing has an exact sold-price comparison. Existing price/shipping states, eligibility/ranking, affiliate wrapper, routes and canonical/indexability decisions remain intact in this diff.

Verification: 67/67 focused tests passed (deal-card-analytics-render, deal-first-review-fixes, deal-first-r1, homepage-hierarchy, homepage-browse-conversion-uxcvr2, mobile-discovery), exit 0. New integration tests exercise the actual cache projection, DealCard and AffiliateLink handler with transport stubbed. ESLint for all five changed application files passed with no warnings, exit 0. git diff --check passed. The initial stale wording assertion and browser focus timing failure were corrected and rerun; neither failed run counted as approval.

Provider-safe local Chromium verification: 22/22 checks passed, exit 0, including menu focus cycles, keyboard reachability, filters/empty state, canonical/robots output for selected homepage variants, outbound href/rel/customid construction, dark mode and mobile reflow. Driver ../codex-r2-functional.mjs; retained record ../shots/CODEX-R2-record.json and CODEX-R2-01 through 06 screenshots. Server-side homepage paths were inspected before use; no card/search routes, paid pricing-provider calls, affiliate navigation or DB writes were performed. Analytics/rates requests were blocked. Four Next image LCP warnings on sorted/paged views remain recorded; no non-blocked HTTP >=400 or browser exceptions were recorded. Console text retention is capped at 300 characters, so this is not complete production error/performance evidence.

Visual evidence: ../shots/CODEX-FOLD-record.json and CODEX-FOLD-{1280x900,1440x900,390x844,320x800}.png. Codex inspected desktop 1280, mobile 390 and the dark mobile feed screenshots. Complete first offer is visible at desktop and 390; at 320x800 its CTA bottom is 808 and card bottom 821, requiring a small scroll. No horizontal page overflow at these sizes. These are revised local homepage captures with current inventory, not baseline or simulated state fixtures. The final menu-ref cleanup did not change layout; final browser evidence was regenerated after it.

Remaining limits: no new full production build, real-device Safari/Firefox, comprehensive checklist/print browser check, production analytics ingestion, Core Web Vitals or SEO-wide runtime verification. Prior full-scanner result remains failing (12 independently matched baseline failures); the focused passes do not erase it. AUD-01 storage fallback, AUD-02 uncertain-shipping structured data, AUD-05 print scope and AUD-06 older card-family shipping wording remain open. AUD-02 blocks SEO-ready release acceptance. Earlier five R1-R2 review fixes remain covered by the focused suite; no new second-agent review of this Codex-written slice is claimed.

Next task: independent review of stable a15bb51 when Claude is available, then James's R2 visual approval. R3 is blocked on that approval. Production push/deployment remains unapproved. Stage B stays OWNER_SUSPENDED; outreach parked; original research queued; the recorded 19 September 2026 GSC note remains unchanged.

### Owner visual approval and bounded SEO correction (2026-09-13)

James approved the presented R2 desktop/mobile design and instructed continuation. This clears the owner visual gate for the revised a15bb51 layout; it is not technical acceptance, production approval or a claim that every PDF gate is complete. Current starting HEAD is 372195e5dbcbe7f7b066f4a76d21e45e3adecda8, clean at handoff. Claude job b4b590ce remains stopped and subscription-limited until the reported 11:20am; Codex remains sole writer.

Next bounded work: AUD-02 structured-data correction. Source reinspection confirmed Number(deal.shipping ?? 0) publishes a zero shipping charge for missing/ambiguous data. Use the existing shipping contract to omit optional shippingDetails unless a positive charge is recorded. Test the actual Product JSON-LD expression after the real cache projection, without importing the route or calling providers. This is a correctness fix ahead of the R3 redesign; R3 provider-disabled fixture work and independent review remain pending.

AUD-02 implementation: 201f0a9960260cf34856168ee48cd170214d0365. Optional shippingDetails now serializes only for the shared contract's confirmed positive charge; missing/zero/invalid amounts do not publish free shipping. Verified 41/41 tests (22 actual JSON-LD expression cases through slimPoolRow plus 19 existing review regression checks), exit 0; listing route ESLint clean, exit 0; diff whitespace check passed. No route import, page fetch, build, provider call or database write. Offline expression evaluation does not establish rendered production metadata or full SEO acceptance. Other existing Offer fields and destination assumptions were not changed or newly validated by this bounded fix.

Status: AUD-02 source defect corrected with offline regression coverage; independent review and safe rendered-route verification remain required for release. AUD-01/05/06 and historical baseline scanner failures remain open. James's R2 visual gate is approved; implementation writer remains Codex with Claude stopped. Next: complete the remaining bounded preservation fixes and obtain independent review when Claude's subscription is available, then establish R3's provider-disabled fixture matrix before redesigning listing/card routes. No production approval has been given.

### Checklist preservation correction AUD-01 (2026-09-13)

Implementation ac45c4dc4d080d302f51a31045d3bc09c31947e0, based on clean 62f8ee9. Codex sole writer; Claude job verified stopped before editing. A failed storage write now makes the session snapshot authoritative even if localStorage reads still succeed. This includes an empty reset. A later successful write persists all session changes, clears the fallback and resumes reading external storage updates. Existing keys, row identities, events, SSR snapshot and UI failure wording are unchanged.

Reproduced before fixing: three new behavioural tests failed on stale reads, failed reset and recovery losing unsaved marks; the denied-read case passed. After correction, 46/46 focused tests passed (new storage failures plus checklist-progress-17c11 and set-checklist-17c2/3/4), exit 0. ESLint on implementation and new test passed clean, exit 0; git diff --check passed. Tests use the actual storage module with a simulated browser storage/event interface, not real browser reload/print evidence. No providers, DB writes or server requests. These checks do not revalidate catalogue identities or replace the planned browser checklist/print matrix.

AUD-01 source defect corrected; independent review still pending. AUD-02 remains corrected with offline coverage. AUD-05 print scope and AUD-06 older family shipping presentation remain open, along with recorded release evidence limits and baseline scanner failures. Next bounded task is print-scope correction with actual offline browser print evidence, then independent review and R3 provider-disabled fixtures. R2 visual approval remains recorded. Production remains unapproved; Stage B OWNER_SUSPENDED and research/GSC backlog unchanged.

### PDF coverage reconciliation and AUD-05 print correction (2026-09-13)

James requested continuation of the entire agreed plan with nothing omitted. This authorises continued local implementation in bounded packages, retaining review gates and all permanent boundaries. Re-read the 15-page PDF's saved extraction ../audit-pdf.txt and companion Downloads/PokemonDealFinder-Deal-First-Overhaul.md. The table below is a coverage index within this master ledger, not a replacement roadmap. Historical evidence remains scoped to its recorded commit; a covered topic is not automatically accepted.

| PDF section / pages | Requirements retained | Current status and acceptance still needed |
| --- | --- | --- |
| 1 / p1 | Deal-first journey, premium red/white utility, US-first organic strategy, international support, existing platform | R1-R2 built; owner approved desktop/mobile layout. No revenue uplift or whole-site completion claimed. |
| 2 / p2-3 | Evidence provenance, keep/reposition/restyle/repair mapping, historical findings not reopened without evidence | Base and fixes recorded; source, fixtures, local browser and production evidence remain distinct. Independent review of Codex-written commits pending. |
| 3 / p3-4 | Appeal plus repeated-task usability; fewer simultaneous choices; visible feedback; essential price facts never hidden; truthful references; no invented urgency | R2 hierarchy and known shipping states implemented. Saving/reversal, return visits, full contrast/reduced-motion and later families remain in R3-R6 checks. H1-H5 remain hypotheses. |
| 4 / p4-5 | Deal hunter, exact-card organic visitor, set/species collector, editorial reader, returning user journeys | Homepage checked; R3 exact-card/listing, R4 collector and R5 editorial/return journeys pending. |
| 4 / p5 | Moderated 5-8-person qualitative pilot; budget, total explanation, auction, printing, saved context and checklist/reload tasks; repeat visit | Pending participants and separate recruitment authorisation. No outreach, forced purchases, claimed comprehension or statistically inferred uplift. |
| 5 / p5-7 | Compact shared nav, offer-led hero/feed, supported modes, catalogue/editorial/trust/footer, direct eBay action and search shortcut | R2 implemented and visually approved; measured population changes recorded. Later page-family adoption remains pending. |
| 5 / p6-7 | Real artwork, ratios, readable identity/condition/prices, consistent spacing/radii, responsive/dark/reduced motion, no rotating reading content, back context | Local R2 captures available at 1280/1440/390/320; 320 first card needs a small scroll. Safari/iOS, contrast, back-navigation and later families require verification. |
| 6 / p7 | BIN, auction, insufficient comparison, reference-only, shipping/destination uncertainty, expired and sparse states; distinct timestamps; comparison comprehension | Shared card states and cache boundary tests exist. R3 actual-template fixture matrix pending; no customer comprehension test completed. AUD-06 older SpeciesCard/SealedDealCard presentation remains open. |
| 7 / p8-9 | Existing PostHog/Vercel/EPN/Impact semantics; reach/selection/outbound denominators; approved/pending/reversed earnings; privacy/DNT/GPC | Measurement docs corrected; handler tests are not ingestion. Baseline exports, equivalent windows, supply confounders and post-release earnings evaluation pending. No incompatible population joins or duplicate-stream summing. |
| 8 / p9 | Home/categories, listing, permanent card, set/species, directories, latest/sealed/Japanese, guides, research, saved/recent/alerts, trust/footer | R2 pilot complete visually, technical follow-ups tracked. R3-R5 family work pending; preserve exact language/unit, dated-study provenance, existing retention and verified links. |
| 9 / p10-11 | R0-R7 sequential packages, R6 quality throughout; map 13A/17B/17K, 13C, 17C, 17J and 17D history | Existing phase mapping retained. No duplicate roadmap, unrelated commits/main-tree changes or silent later-phase acceptance. |
| 10 / p11 | Provider/cache costs, isolated worktree, exact ancestry, no credentials, paid calls, DB/cron/social/outreach changes | Current work remains isolated/offline as recorded. R3 provider-disabled harness must exist before route rendering; production/base refresh belongs to authorised release preparation. |
| 10 / p11 | URLs, canonical/robots, sitemap membership/lastmod, schema truth, unique crawlable identities/links, sponsored affiliates, search/pagination policy | Selected home variants checked; AUD-02 schema corrected offline. Full family metadata/sitemap/unique-link comparison remains a release gate. |
| 10 / p11-12 | Jungle 64, Neo Destiny 113, Boundaries Crossed 153, Dragonite 75 against current approved identities; SSR/hydration, storage/reset/keyboard and print | AUD-01 storage corrected and tested. AUD-05 structural print corrected below. Actual four-pilot data/link/interaction/print matrix remains R4 work; species gets no set-only Own controls. |
| 10 / p11-12 | 1280/1440/390/320, long names/prices, unknown shipping, mixed currency, loading/empty/unavailable, Chrome + Safari/iOS, 44px intended targets | R2 partial evidence recorded; unavailable browsers and missing states remain explicit pending items. 44px design target is not a misstatement of WCAG's minimum. |
| 11 / p12-13 | Supported local handoff, bounded commits, exact evidence, review gates before R3/R4/R5, explicit release approval, R7 read-only evaluation | Earlier handoff cycle demonstrated; Claude currently stopped/usage-limited. Codex sole writer; its own testing is not independent review. R2 visual approval recorded; independent technical review pending. |
| 12 / p14 | Source and historical evidence provenance, no withdrawn SEO claims or unverified source-derived guarantees | Retained as context, not fresh runtime proof. Original research queued; 19 September GSC observation unchanged. |
| Design reference / p15 | Proposed composition uses placeholder values and does not prove listing availability | Approved actual R2 local captures are labelled separately from the PDF mockup and simulated fixtures. |

AUD-05 implementation: 38bfb47bdb06f6d88473437675fbe461cf6c581b. Print-only isolation now applies only when a checklist root exists and preserves the root and its ancestors at any nesting depth. Previously an article without a checklist and a checklist directly under main both printed blank; a nested checklist passed. Revised offline Chromium check passes all three cases. It uses the real @media print CSS on explicitly synthetic structural fixtures, not real catalogue pages.

Evidence: ../codex-print-check.mjs; ../shots/PRINT-BEFORE-* and PRINT-AFTER-* records/screenshots/PDFs. Actual generated AFTER PDFs were read with installed pypdf: article text remains; direct/wrapped checklists contain missing scope and missing row, exclude owned row, unrelated offers and decorative artwork. Print-media screenshot inspected. The initial PDF extraction attempt failed because fitz was absent; no install was made, and the installed pypdf extraction subsequently passed, exit 0. Existing checklist-progress-17c11 tests 19/19 passed, exit 0; diff check passed. This does not establish full real-page print, Safari print or catalogue coverage.

Open queue: independent review of a15bb51 and subsequent fixes; AUD-06 exact data-shape/wording correction; R3 provider-disabled actual-template matrix and premium listing/card work; R4 catalogue/checklist matrix; R5 remaining families; R6 cross-family technical/visual/SEO release gates; R7 baseline/post-release evidence and qualitative study. Stop on genuine unavailable evidence or disagreement, never convert it to a pass. Stage B OWNER_SUSPENDED, outreach parked, no paid providers/DB writes, no production push/deployment approved.

### Continued local autonomy and AUD-06 correction (2026-09-13)

James authorised continuing the agreed plan without asking him to verify each routine change. Codex handles ordinary implementation and design decisions. This does not waive technical evidence, independent review, explicit production approval, paid-provider/DB restrictions, Stage B suspension or the research/GSC preservation contract. Sandbox approvals remain environment-controlled; no bypass or Full Access change was performed.

AUD-06 implementation: 47b39363478e63deac10678ec0624eca28328949. All three existing catalogue offer projections now preserve shipping and listing currency. SpeciesCard uses those fields through the shared shipping contract and native currency resolver. Legacy cached rows missing shipping show Recorded price/total and no savings claim; zero carries Shipping not confirmed and before-shipping comparison wording; positive charges retain the recorded-shipping explanation. Auction uncertainty remains explicit even without a comparison. SealedDealCard applies the same savings suppression/qualification to its fixed-price body, badge/score eligibility and share text; AuctionPrice keeps the existing shared contract. Unsupported savings pass no_savings_claim into affiliate analytics. Existing eligibility, order, exact destinations, affiliate wrappers, cache cadence and no-offer search behaviour remain unchanged. Cached old rows degrade honestly until refreshed; no cache invalidation/provider work was performed.

Evidence: 42/42 focused tests passed (catalogue-shipping-render, species-shop, deal-card-analytics-render), exit 0. New tests evaluate all three actual catalogue projection object expressions, then actual SpeciesCard/SealedDealCard render functions with child components/transports stubbed. Includes unknown/zero/positive charges, BIN/auction and a GBP listing on the US marketplace. ESLint on all changed implementation and test files passed clean. Initial test-harness lint errors blocked the commit, were corrected, and checks rerun; no failed run counted as approval. Diff check passed. This is offline integration evidence, not whole-route browser, catalogue identity or production ingestion verification.

Current application commit 47b3936; Codex sole writer. All six AUD source defects now have scoped corrections recorded, but independent review and actual affected-family browser acceptance remain pending. R3 next work is the provider-disabled actual listing/card template harness; only render those routes after server-side provider isolation is demonstrated. Full PDF coverage table above remains the checklist for R3-R7 and outstanding R6 quality gates. No deployment, new server, paid call, DB write or social/outreach action occurred in this slice.

### R3 offline route fixture foundation (2026-09-13)

James approved proceeding with R3 fixture setup. Commit e7a98fff879d79106c86237157497c12df181919 adds tests/helpers/r3RouteHarness.mjs and tests/scanner/r3-route-fixtures.test.mjs. Both actual route functions and generateMetadata execute after SWC transformation; fixture-backed database and price-analysis dependencies replace the production modules before route evaluation. Next cache wrappers are identity wrappers in this harness; unknown route dependencies throw. Child components are explicit stubs. Existing pure identity, eligibility, expiry and monetary helpers execute. Fetch is denied during every test; real route HTTP endpoints are not requested. This controlled test harness is not a new sandbox or a production provider-disable flag.

Eleven tests passed, exit 0: active raw/graded/auction/plain/unknown-shipping/non-USD listing routes and metadata; expired redirect with no price-analysis request; priced/unpriced catalogue-only fallback; permanent hub with/without offers. Active listing cases assert JSON-LD is reached and fixture pricing is used, avoiding false passes through an ended-state branch. Initial expiry fixture lacked watchlist_id and correctly reached not-found; the fixture was corrected and all tests rerun. ESLint clean and diff check passed. No production application files changed in this commit.

Limits and next work: route-controller execution is now provider-isolated offline, but child component rendering, browser hydration/interaction, actual cache semantics and visual acceptance are NOT established. The harness must be extended to real component/HTML rendering and safe screenshots before calling the R3 fixture matrix complete or fetching real listing/card routes. The existing route source also still has independent headline/metadata comparison logic; apply shared truthful states during the R3 implementation and verify it through these boundaries. Independent review of Codex changes remains pending. Full PDF coverage, routine owner-verification waiver and permanent boundaries remain as recorded above. No deployment, paid call, DB write or scanner change.

### R3 real price HTML and listing shipping contract (2026-09-13)

Implementation b3bb9c7f650277c293163556e1245e494f29a8ea extends the offline harness to real Price, AuctionPrice, AffiliateLink, CardPriceSummary and CatalogCardView rendering. Currency context is fixed to native display; Next Link uses a basic anchor adapter. Database/provider dependencies remain fixture-backed, fetch is denied during tests, analytics transports throw if invoked. Images, header/footer and other supporting children remain stubs, so this is partial real HTML rendering, NOT a full visual/hydration harness.

The real markup tests independently reproduced two existing listing-template failures: zero shipping lacked the unconfirmed note and missing shipping still showed savings. Corrected the listing body, badges/headline, share text and metadata to use the shared shipping contract. Missing breakdown suppresses savings; zero qualifies comparisons before shipping. Metadata titles only use an unqualified discount when shipping is confirmed; unknown breakdown uses neutral description. Existing route/robots/canonical policy remains unchanged. Main/sticky analytics no longer receives a numeric discount when no saving is supported. This does not claim every auction/detail/metadata edge is complete.

Verification: 40/40 offline tests passed (r3-price-markup, r3-route-fixtures, listing-shipping-schema), exit 0. Includes actual sponsored affiliate HTML and priced/unpriced permanent catalogue fallback without an invented listing action. Two initial markup failures counted as failures and passed after correction. ESLint on changed files clean; diff check passed. No browser/page fetch, provider, DB write or build. R3 visual redesign and full component/browser fixture rendering remain in progress; independent review remains pending. Next extend the rendering boundary to remaining components/assets, obtain labelled fixture screenshots, then complete listing/card hierarchy and the remaining R3 state/interaction matrix. The PDF coverage table and R4-R7 gates remain open as recorded.

### R3 static visual baseline (2026-09-13)

Commit c806a609c981c6b4e7d8f5b742dcf0a83f32581d extends the test-only renderer to actual header/footer/nav, image wrapper, clock, saving/share controls and supporting price/identity components. scripts/renderR3Fixtures.mjs generates labelled static HTML from actual routes using fixture-backed data. Native img replaces Next Image optimisation; Link uses a basic anchor; currency is native; dynamic effects/hydration do not run. The generated manifest explicitly lists all remaining child substitutes. No production renderer or provider-disable flag was added.

Evidence: ../shots/r3-static/{bin_compared,bin_shipping_unknown,auction,reference_only}.html and manifest.json; ../shots/R3-STATIC-*.png and R3-STATIC-record.json, generated by ../codex-r3-static.mjs. Twelve Chromium captures at 1280/390/320 x 900; all fixture images loaded, no horizontal overflow, exit 0. Browser allows only the catalogue image CDN and data resources; no application route/provider was requested. Styles use the already-compiled app CSS timestamp recorded in the manifest; Arial fallback is labelled, so these are not final font/visual-fidelity acceptance. Prices/links are simulated, correctly matched catalogue artwork remains explicitly reference art.

Codex inspected corrected mobile BIN and desktop unknown-shipping captures plus the reference-only desktop composition. Found actionable R3 hierarchy work: mobile listing action is low on the initial screen, reference-only hero leaves large unused space before the price answer, and listing history still says fetched fresh despite the cached/fixture data model. These are baseline observations, not newly introduced harness regressions. Initial capture exposed an incorrect clock substitute displaying epoch numbers; replaced it with the real RenderClock implementation and regenerated captures. No application timestamp fix was required.

Verification: 20/20 focused R3 route, markup and visual-SSR checks pass, exit 0; changed-file ESLint clean and diff check pass. Captures demonstrate static component/layout behaviour only. No menu/save/hydration/image-optimisation, real-device Safari, performance or provider-ingestion pass is claimed. Next: apply premium R3 listing/card hierarchy and truthful history/reference wording, compile CSS offline as needed, compare revised captures, then complete the interactive fixture path and independent review. R4-R7 and all PDF coverage/approval boundaries remain pending as recorded. Nothing deployed.

### R3 hierarchy implementation (2026-09-13)

Commit 857de6cac378a9854763c442d5bf21e2276674c3 makes listing and permanent-card heroes more compact without removing identity, history or supporting content. Listing art remains contained; the main price is 30px and the eBay button is red with a 48px minimum target. The listing history no longer claims a per-page fresh fetch; the buying reminder names card, condition and shipping rather than promising all inventory is below sold prices. Catalogue and live-card heroes now show the raw reference (or an explicit unavailable state), real condition or unknown-condition note, and distinguish the reference from an available offer. Existing reference precedence is reused; rejected analysis never falls back to stale catalogue price.

R3 fixture CSS now compiles offline from current app/globals.css through installed PostCSS/Tailwind, with existing local Geist fonts embedded. No Next build/prerender or provider path runs. Earlier static baseline preserved under ../shots/r3-baseline. Revised static captures remain ../shots/R3-STATIC-*.png: 12 captures at 1280/390/320 x 900, no horizontal overflow and all fixture images loaded, exit 0. Codex inspected revised 390 listing and 1280 reference-only pixels; the entire red primary listing action fits within the 390x900 capture, including the fixture banner. This is viewport/fixture-specific, not an all-state first-screen guarantee. Fonts differ from the earlier Arial baseline and are not an isolated layout experiment.

Verification: 44/44 R3 route/markup/SSR/schema tests pass, exit 0. New tests exercise a priced live hub hero and rejected-analysis fallback. A missing Price import found by lint was fixed before commit. Listing, catalogue component, generator and test lint pass. Card route lint remains failing with two Date.now react-hooks/purity errors; both independently reproduced against prior HEAD at the same original call sites, and no new errors remain. Do not describe the full lint run as clean. Diff check passed.

Limits: captures still use static SSR and recorded substitutes (no hydration, image optimisation or interactive flow proof); live-hub priced hero has HTML regression evidence but not its own revised screenshot yet. Remaining R3 work includes all required priced/graded/no-reference/auction/expiry states, first-class live-card offer flow, actual controls/back-navigation/mobile sticky behaviour, currency variations and metadata/SEO integration, followed by independent review. R4-R7 and the complete PDF coverage index remain active. Codex is sole writer; no production deployment, paid provider, DB write or unrelated cleanup.

### R3 interactive component verification (2026-09-13)

Commit 6ffca3d8f60990454f75f6eb4747151c0f26e5b2 adds a provider-isolated client fixture using installed webpack/SWC and actual CardDealFilters, DealCard, SaveCardButton, NavMenu and StickyDealCta. tests/browser/r3 contains explicit native-link/image and currency/analytics boundaries. Only the expected card filter request is mocked; production provider imports are rejected and bundled resources checked to exclude production analytics/currency modules. Initial alias ordering was corrected before browser use; a subsequent text search false-positive matched comments mentioning api/rates, replaced by module-resource inspection. No API billing, dependency install or real application endpoint was used.

Browser evidence: ../codex-r3-interactive.mjs loads the generated HTML by fulfilling an intercepted synthetic origin, with no server. 10/10 checks passed, exit 0: actual cards render; save writes existing pdf:savedCards; reload retains it; undo works; graded filter changes URL and invokes fixture response; Back restores URL; menu focuses Close and Escape restores opener; sticky CTA appears after scroll; actual affiliate click handler reaches the fixture SDK capture. Navigation is prevented for the test click, so no affiliate request is sent. Record ../shots/R3-INTERACTIVE-record.json; screenshot R3-INTERACTIVE-390.png. Zero exceptions/console errors; three blocked favicon requests retained. This is a client-mounted component fixture, NOT full Next hydration, real server filtering, production ingestion or real-device proof.

Static harness now includes the real live-card filter/offer area. Added hub_with_offers; 15 captures at 1280/390/320 x 900, all images loaded, no overflow, exit 0. Codex inspected the live-hub mobile capture. Its hero has the reference answer but still needs a clear path to the actual offer area; retain that concrete R3 product task. Initial generation failed closed on a missing pure affiliateSurfaces dependency, and the dependent screenshot attempt lacked its HTML; neither was counted as passing. After adding the existing pure helper, generation and captures passed.

22/22 focused R3 tests passed, exit 0. Changed harness/build files lint has zero errors and one expected native-img optimisation warning in the explicitly unoptimised test adapter; production card-route Date.now errors remain independently recorded. Diff check passed. No production files changed this slice. Next: finish live-hub offer navigation/hierarchy, remaining R3 state/metadata/sticky-price truth checks and independent review before moving to R4. PDF coverage and remaining R4-R7 gates stay open; no deployment or production data change.

### R3 offer navigation and sticky-price truth (2026-09-13)

Implementation b3552ff90f86dafb4768c04549b2a3506eb89a09 adds a 48px red hero link to the existing live-card offer area, showing the actual initial offer count. It preserves listing eligibility, affiliate destinations and wrappers. Listing and permanent-card sticky bars now distinguish recorded auction price from current bid when bid fields are absent; fixed-price labels and shipping caveats use the shared shipping contract. Hidden sticky content is inert. The live-hub screenshot fixture now includes its collector number.

56/56 focused route/markup/SSR/schema checks pass, including 12 new actual-route sticky prop cases for both routes with present/missing bids and positive/zero/missing shipping. Changed component, listing route, fixture generator and test lint pass. Card-route lint still reports the same two previously base-matched Date.now purity errors; not counted as passing. Diff check passed. An initial edit stopped on Windows default text decoding, followed by an assertion on an already-applied replacement; neither attempt ran or passed tests. Explicit UTF-8 handling completed the remaining edits before successful verification.

Regenerated provider-isolated static and client fixtures. 15 static captures (1280/390/320) have no overflow or failed images; 10/10 existing client interaction checks pass, zero JS errors, three blocked favicon requests. Codex inspected R3-STATIC-hub_with_offers-390.png: identity, reference and red offer jump are visible in this viewport. Records remain ../shots/R3-STATIC-record.json and ../shots/R3-INTERACTIVE-record.json. These are simulated fixtures, not full Next hydration, production data/ingestion or real-device proof. New sticky route props have regression evidence; the existing interactive fixture does not prove all new shipping-note layouts or keyboard inert behaviour. Anchor click/scroll has source/target evidence, not a new behavioural assertion.

R3 remains in progress: remaining state/currency/metadata coverage, sticky note layout at narrow widths, offer-jump behaviour and independent review remain required. PDF coverage matrix and R4-R7 gates remain open. Codex remains sole writer; Claude has not independently reviewed this slice. No deployment, paid provider calls, database writes or main-tree changes. Next owner decision remains production/release approval when technical gates are met; no routine decision is needed for this slice.

### R3 narrow sticky layout and offer-jump behaviour (2026-09-13)

Implementation 7a8e97e82c4df54b344b8b9f58cf30a366cf4da3 increases the listing and card footer clearance from 80px to 128px. The 320px browser fixture showed that the new wrapped unknown-shipping note makes the sticky bar about 96px high, exceeding the previous reserved space. Codex inspected the corrected 320px screenshot; the fixture footer marker remains visible above the bar. This is a correction to the preceding R3 slice, not a claim of full production-footer testing.

Committed repeatable runners scripts/verifyR3Static.mjs and scripts/verifyR3Interactive.mjs, adapted from the existing local runners. After generating fixtures with renderR3Fixtures.mjs and buildR3Interactive.mjs, run each verifier with explicit ../shots argument. They use isolated headless Chrome and generated HTML only; allow reference artwork CDN, block application/provider/affiliate/analytics requests. The interactive fixture exposes a test-only rerender hook for sticky scenarios and retains real production components.

Verification: 56/56 focused R3/schema tests pass; changed fixture/listing and new runner lint pass, diff check passes. Static captures 15/15: no overflow or failed images. Actual static-route offer-anchor clicks scroll successfully at 1280/390/320 with target top approximately 96px. Interactive checks 23/23, zero JS errors: prior save/filter/menu/affiliate checks plus hidden sticky focus refusal, six shipping/large-AUD layout cases at 390/320, and six footer-clearance cases. Four blocked favicon requests retained. Records ../shots/R3-STATIC-record.json and R3-INTERACTIVE-record.json; new screenshot family R3-STICKY-{unknown,unconfirmed,large}-{390,320}.png. Codex inspected unknown-shipping and large-AUD 320px images, then corrected unknown-shipping footer clearance image.

Limits: native anchors in static SSR, client-mounted component fixtures, simulated prices and mocked transport; not full Next hydration or production proof. Footer clearance check uses a fixture marker and the same reserved space; zoom/custom font sizes and actual footer integration remain unverified. Existing card-route Date.now lint failures remain open. Independent Claude review and remaining R3 state/currency/metadata coverage are still required before marking R3 complete. Existing PDF coverage index and R4-R7 gates remain open. Codex remains sole writer; no production deployment, main-tree edits, paid provider calls or database writes. Next task: close remaining R3 state/metadata integration gaps and obtain independent review when Claude is available.

### R3 auction and graded metadata truth (2026-09-13)

Implementation 64b118cdfca608fdc6a4a559031da22d73f39a3f corrects listing metadata: auction title/description identify an auction, name the native current bid only when recorded, warn that the final price may rise, and preserve shipping uncertainty. Auction previews no longer present a provisional total discount as a fixed offer. Graded titles/descriptions include the recorded grader/grade. Plain auctions retain noindex and no savings claim; expired listings retain their existing unavailable metadata. Canonicals, eligibility, affiliate wrappers and body layout are unchanged.

Independently reproduced actual-route output before editing: the auction fixture advertised 'for $618.00 - 44% below' without auction wording; the graded fixture omitted PSA 9. Source at redesign base 8b16321395153f49bc303ffc2b10e8495a61ba9a contains the same omissions, so these are existing limitations addressed within R3, not newly attributed regressions. Nine new route metadata cases initially produced seven expected failures and two passes. After the fix, 65/65 combined R3 metadata/route/markup/SSR/schema tests pass, exit 0; changed route and test lint pass, diff check passes. Cases include shipping positive/zero/missing, missing bid, plain/expired auctions, graded identity, foreign native bid without USD conversion data, and fixed-price canonical USD comparison.

Tests use actual generateMetadata with fixture-only data and global fetch denial. No pricing provider, production URL, database write or build was used. This slice has no new browser/visual claim; metadata object tests do not establish Next head merging, crawler ingestion or live search previews. Previous card-route Date.now lint errors, remaining R3 state/currency/body integration coverage and independent Claude review remain open. Full PDF coverage index and R4-R7 gates are unchanged. Codex is sole writer. Next: remaining R3 unsupported-price/currency and graded/no-reference rendered-state coverage, then independent review; no production deployment authorised by this slice.

### R3 foreign-currency fallback and rendered states (2026-09-13)

Implementation 0d936233b5bd8d4ddac34efac9b6bfa1061d49a4 uses existing dealTotalUsd for listing detail, AuctionPrice fallback, card-hub range summary and sticky price. Missing/zero foreign USD values now remain null instead of substituting native currency or zero. Price therefore retains the recorded native amount rather than converting a GBP value as USD. Valid stored USD conversions are unchanged. The unsafe fallback in listing detail and AuctionPrice also exists at redesign base 8b1632; this corrects an existing limitation within R3.

Seven new actual-route currency tests initially had five failures and two passes. All seven pass after the fix; combined R3/schema suite 72/72 passes, exit 0. The harness accepts an explicit fixture currency context, exercising real Price/AuctionPrice output with a USD viewer, GBP native price, missing/zero/valid stored conversion data, plus card-hub USD summary/sticky props. Changed files lint pass except card route: its two previously base-matched Date.now purity errors remain, exit 1, not counted as a pass. Diff check passed.

Static generator adds graded, bin_plain and non_usd states; verifier reads the generated manifest so states cannot silently be skipped by an old hardcoded list. 24 captures at 1280/390/320: no overflow, failed images or blocked requests. Existing offer-anchor checks pass at all three widths. Codex inspected new 320px graded/no-reference/GBP pixels: grade visible, no-reference state makes no savings claim, and the GBP comparison uses pounds. Saved R3-STATIC-{graded,bin_plain,non_usd}-320.png and updated R3-STATIC-record.json. These are simulated static routes, not full Next hydration or live FX/provider evidence.

Remaining R3 work includes absent/invalid native-price states, live currency-control behaviour, complete head/body/structured-data integration and independent review. Alert-price suggestions and other route families have not been included in this bounded fallback correction. No whole-site currency assurance is claimed. PDF coverage matrix and R4-R7 gates remain open; Codex is sole writer. No production deployment, paid provider calls, DB writes or main-tree changes. Next: unsupported native-price handling and independent review when available.

### R3 unavailable native prices and auction rich-price guard (2026-09-13)

Implementation 5a009dca41a4c5b3bd780f679214e2f2aee36786 gives missing, zero, negative and nonnumeric listing totals an explicit Price unavailable state, retaining the actual eBay action. Listing savings are suppressed, unavailable-price metadata keeps the canonical but uses noindex,follow, and no Product offer is emitted. StickyDealCta and shared AuctionPrice fallback no longer display invalid native values as zero/negative prices. Auction Product output also requires usable bid parts; a missing bid cannot advertise the stored total as the bid. Eligibility/ranking/scanner data paths were not changed.

Before editing, all 11 new route cases failed, independently reproducing zero/negative rendered prices and unsupported auction Offer output. Added a shared AuctionPrice fallback case as well. Final combined focused suite: 84/84 pass, exit 0. Changed files lint and diff check pass; previously documented card-route purity errors remain outside this slice. The new noindex decision is limited to unusable native-price listing records; valid-price metadata and canonicals retain their existing rules. This is not a whole-site sitemap/indexability audit.

Generated price_unavailable fixture joins the existing eight states: 27 static captures, no horizontal overflow or failed images, all three offer-jump checks pass. Codex inspected R3-STATIC-price_unavailable-320.png: readable unavailable wording, no savings and a visible eBay action. Interactive runner now includes unavailable sticky-price layout and footer clearance at 390/320: 27/27 checks pass, no JS errors; four blocked favicon requests retained. Existing R3-STATIC-record.json and R3-INTERACTIVE-record.json updated. Screenshots and interactions remain simulated/provider-isolated, not production or full Next hydration evidence.

Codex remains sole writer. R3 still requires independent review and remaining live currency-control/head-body integration verification. Shared-component behaviour outside the R3 fixtures and production crawler ingestion are unverified. Existing PDF matrix and R4-R7 gates remain open; no production deployment, paid provider calls, database writes or main-tree modifications. Next: stable-commit R3 integration review and close remaining evidence gaps without starting R4 prematurely.

### R3 real currency-store hydration verification (2026-09-13)

Commit 36d31b36bbbcb9781cd369473a6ff70a8e45c26e adds a separate currency fixture, without production-code changes. scripts/buildR3Currency.mjs ../shots/r3-static renders native Price server markup and bundles actual Price/CurrencyProvider; tests/browser/r3/currency.jsx hydrates it with hydrateRoot. Only /api/rates is mocked, with explicitly controlled success/failure. Production pricing/DB modules and analytics transport remain forbidden. scripts/verifyR3Currency.mjs ../shots runs an isolated synthetic-origin browser with no application server.

11/11 behavioural checks pass, exit 0: native GBP before rates, one fetch across subscribers, consistent AUD listing/reference/saving conversion from USD, absent USD remains GBP, existing pdf_rates_v1 cache excludes geography, no hydration recovery, cached rates prime before response, failed refresh retains cache, uncached failure retains native prices, no 320px overflow. Zero console/JS errors; three blocked favicon requests retained. Evidence ../shots/R3-CURRENCY-record.json and R3-CURRENCY-320.png. New files lint and diff check pass. No unrelated regression suite rerun because production code is unchanged.

This verifies component-level hydration with the real currency store, not complete Next route hydration, live rates ingestion or real-device behaviour. Source review confirms RegionControl selects marketplace/filter country separately from currency geo/rates; no new currency picker was introduced. Broader stable-commit cross-component acceptance is still incomplete. Independent reviewer remains outstanding; Codex is sole writer and these self-run checks are not independent review. R3 stays active, with head/body/schema integration and region-control accessibility/interaction review next. PDF matrix and R4-R7 gates remain open. No production deploy, paid providers, DB writes or main-tree changes.

### R3 shared region-control accessibility (2026-09-13)

Implementation fea65b49ae61425966ea8593b3c236790adeef0f fixes RegionControl's mobile accessible name, 44px opener/options, menu labelling and keyboard focus. Arrow keys open/navigate, Home/End navigate, Escape restores the opener, Tab exits to the next control, and focus leaving closes the menu. Existing country choice, storage key, pagination reset and filter navigation are preserved. No currency picker or marketplace expansion was introduced.

Browser reproduction before editing: 28/32 checks passed and four failed; Chrome accessibility tree reported an empty mobile button name, the opener was under 44px, and keyboard open/End failed. Final 36/36 checks pass, exit 0, no JS/console errors. New checks confirm accessibility-tree name Listing country: All countries, option targets, keyboard open/End/Escape/Tab, actual synthetic-origin navigation preserving type=graded while clearing page, pdf:region persistence, and explicit All countries clearing the country filter. Eight blocked favicon requests retained. Navigation serves generated HTML only; no application endpoint or provider is contacted.

Updated 27 static captures and three offer-anchor checks pass: no overflow or failed images. Codex inspected R3-REGION-MENU-390.png; menu options and focused selection are readable within the viewport. Records remain ../shots/R3-INTERACTIVE-record.json and R3-STATIC-record.json. Changed files lint and diff check pass. These fixture results do not establish full Next hydration, screen-reader testing or production traffic behaviour.

R3 remains active pending stable-commit head/body/schema integration review and independent review; Codex is sole writer and self-run checks are not independent approval. Existing card-route Date.now lint errors remain open. PDF matrix and R4-R7 gates are unchanged. No deployment, paid provider calls, database writes or main-tree modifications. Next: consolidate R3 acceptance evidence against the PDF and arrange independent review when available, without prematurely beginning R4.

### R3 consolidated acceptance and independent-review attempt (2026-09-13)

Stable review checkpoint d6f7679 (latest implementation fea65b49ae61425966ea8593b3c236790adeef0f), branch deal-first-r0r2; worktree verified clean. Re-read PDF technical acceptance and R3 continuation text against current evidence. R3 code range for the prepared reviewer is 631ed35..d6f7679; original redesign base remains 8b16321395153f49bc303ffc2b10e8495a61ba9a. No implementation changed in this consolidation.

| PDF/R3 requirement | Current evidence | Remaining acceptance limit |
| --- | --- | --- |
| Listing/card hierarchy; actual offers distinct from references | Nine static fixture states, offer jump, truthful reference hero | Full Next route integration and independent product review pending |
| Fixed/graded/auction/unknown shipping/unsupported prices | Actual route, markup, schema and metadata regressions; last focused suite 84/84 | This does not prove production cache content or every identity/language combination |
| Currency truth and runtime | Real Price/CurrencyProvider hydration: 11/11; missing USD remains native | Mocked rates; full application hydration and live provider ingestion unverified |
| Save/filter/back/sticky/region/affiliate behaviour | Current isolated component runner 36/36; affiliate handler reaches mock SDK | Real filter-server response, production transport/purchases unverified |
| Responsive pixels | 27 static captures: 1280/390/320; selected pixels inspected; no overflow | R3 1440px, dark mode, reduced motion, systematic contrast and Safari/iOS remain unverified |
| Canonicals/indexability/structured data | Metadata tests preserve canonical paths; unavailable native price explicitly noindex; bid-less rich offer suppressed | Full Next head merging, sitemap alignment for those exceptional rows and crawler outcomes need review |
| Crawlable links and collector utilities | Existing links/utility implementation retained; earlier checklist/print fixes recorded | R3 cross-component link identity parity and later R4 utility integration gates remain open |
| Quality gates | Focused checks and changed-file lint passed as recorded | Two pre-existing card-route Date.now lint errors remain; focused passes do not erase prior whole-suite failures |
| Independent review | Read-only Claude invocation attempted on stable checkpoint | BLOCKED by subscription session limit; no reviewer approval |

Claude CLI capability and authentication checks: existing claude.ai Pro login; claude agents --json returned no active agents. One direct read-only --print review was attempted with --restricted, --strict-mcp-config, Read/Glob/Grep only, dontAsk permissions and no session persistence. No bypass flags, API-billing switch or recursive runner. Source patch and unmodified brief/PDF text prepared under ../r3-review-input. Result ../r3-review-input/claude-round1.json returned exit 1, is_error=true, api_error_status=429, zero model tokens and 'session limit ... resets 11:20am (Australia/Brisbane)'. Its subtype field says success but the error/exit status takes precedence: review DID NOT run and is not a pass. No repeated attempts made. Current editing ownership remains Codex; Claude has no active implementation process.

Next local work: close the explicitly missing R3 responsive/dark/reduced-motion and head/schema integration evidence, then retry one bounded independent review after the recorded reset. Do not start R4 or declare R3 complete while these gates remain open. No owner decision needed now; authentication only if the existing login later fails. No deploy, paid pricing-provider calls, DB writes, main-tree edits or later-phase approval inferred. All PDF sections, Stage B suspension, original-research queue and 19 September 2026 GSC note remain in the existing master ledger.

### R3 1440px, dark mode and reduced motion (2026-09-13)

User explicitly confirmed continuing local work while Claude is unavailable, deferring its independent review. Implementation b5e3ed882467a1925512459b91c99577a06421bf adds dark:text-zinc-400 to previously unqualified secondary zinc-500 text in listing/card routes, CatalogCardView and CardWorthAnswer. Inspection of dark listing/mobile and card/desktop captures found dim secondary text; source-token contrast of zinc-500 (#7d7568) on zinc-950 (#100e0c) is approximately 4.23:1. The scoped change brightens those dark labels/links; light classes are unchanged. This is not a complete contrast audit.

Static verifier now covers all nine generated states at 1280/1440/390/320 in both light and dark: 72 captures, no overflow or failed images, eight offer-anchor checks pass. Codex inspected 320px dark listing and 1440px dark live-card pixels, then re-inspected the corrected 320px dark listing. Files use existing R3-STATIC names, with -dark suffix for dark mode; R3-STATIC-record.json records scheme. Selected pixel inspection does not mean every capture was manually reviewed.

Interactive verifier adds reduced-motion media emulation and checks near-zero computed sticky transition duration plus functional hide/inert/show behaviour. 39/39 interaction checks pass, exit 0, zero console/JS errors; eight blocked favicon requests retained. This run preceded the dark-text-only change; the subsequently regenerated static captures passed. Changed-file lint passes except the previously recorded card-route purity errors, which were not rerun or claimed resolved. Diff check passes. No new behavioural tests for simple colour-class changes; existing pricing suite was not unnecessarily repeated.

R3 remains active. Outstanding: Safari/iOS and real-device coverage, systematic contrast/accessibility review, complete Next head/body/schema and exceptional-row sitemap integration, and independent Claude review after its usage reset. Current evidence is isolated Chromium fixtures, not live production verification. Codex remains sole writer; no deployment, paid pricing-provider calls, database writes or main-tree changes. PDF matrix and R4-R7 gates remain open; later-phase approval is not inferred. Next: the remaining R3 head/body/schema consistency checks and review packet update.

### R3 PDF SEO contract: unavailable-price sitemap parity (2026-09-13)

Re-read the PDF's R3 continuation and SEO/rendering acceptance: offline state fixtures, preserve URL/metadata/schema/no-sale behaviour, real interactions and explicit evidence limits. Implementation bf8bd0958c78b15fff800a2a56e290c47d656078 closes a concrete integration gap introduced by R3's unavailable-price noindex state (5a009dc): lib/sitemap.js still admitted those records. The card-deals predicate now requires the same existing hasPrice(total_price) check and its real selected-column list includes total_price. Sealed-deal filtering, URL construction, segment layout, cache windows, pagination and ranking remain unchanged.

New tests evaluate the actual fetchActiveDealIdsUncached function with a mock query that projects the actual selected columns, then compare its output with actual listing generateMetadata. Null/absent/zero/negative/nonnumeric native prices initially produced five failing parity checks; the valid-price control passed. After the fix all six pass. Combined existing sitemap, metadata and unsupported-price checks: 32/32 pass, exit 0; changed files lint and diff check pass. No Supabase/provider/network call was executed; no browser rerun needed for this data-selection change.

The specific exceptional-native-price sitemap gap is closed locally. This does not establish served production XML, cache expiration, crawler ingestion, complete Next head merging or all catalogue sitemap rules. R3 is still active: full-page integration, systematic accessibility/contrast, Safari/iOS and deferred independent Claude review remain open. Existing 72 theme captures, 39 interactive checks and 11 currency-hydration checks keep their original scopes and timestamps. Codex remains sole writer. Next: consolidate head/body/schema consistency and update the independent review patch after further fixes. PDF master matrix, R4-R7 gates, collector utility/provenance preservation, original research, 19 September GSC note and Stage B suspension remain intact. No deployment, paid pricing-provider calls, DB writes or main-tree changes.

### Customer-first premium navigation direction (2026-09-13)

Owner clarified that the priority is the best customer experience and premium presentation, not a sidebar for its own sake. Retain the PDF's compact Deals / Cards & Sets / Guides & Research hierarchy and organised mobile drawer. Consider contextual side navigation only when it helps a large inventory or long article; this is design direction for the relevant later phase, not approval to start R4/R5. Judge changes by finding a relevant offer, understanding identity/price, and reaching the correct listing; do not claim aesthetic changes guarantee revenue uplift.

Implementation a0e07e38c8269d2a7a4c337d497e895ac9461862 renames the /deals directory entry from All Deals to Browse Deals, matching its actual category-led destination and the PDF warning against misleading all-offers labels. Desktop Guides & Research/search targets and dropdown entries now use the same 44px design target as other controls. Routes, grouping, crawlable anchors, analytics attributes, affiliate surfaces and storage remain unchanged. Two existing real-component SSR checks pass, exit 0; changed-file lint and diff check pass. No new test was added for this small label/class change. Desktop dropdown pixels/geometry after this slice have not been captured; earlier screenshot evidence is not claimed to verify it.

R3 remains active with the existing integration/browser/independent-review limits. Codex sole writer. No production deploy, paid provider calls, DB writes or main-tree changes. Existing PDF matrix and later-phase gates stay in force. Next: include the updated desktop dropdown in focused visual/navigation verification and continue remaining R3 acceptance checks.

### R3 premium desktop navigation verification (2026-09-13)

Commit a774be55455ef046b729169d2997a7942f2b85c4 adds actual SiteHeader to the isolated interactive fixture at desktop widths and verifies the a0e07e3 navigation refinements. No production code changed. Checks cover focus without opening, Enter open, Tab to Browse Deals, Escape close/focus return, expected route destinations, retained graded_clicked DOM marker and 44px visible desktop controls (logo excluded). The marker check is not proof of analytics handler execution or ingestion.

Initial run had 42/45 passing, with Enter/Tab/Escape failures. Investigation found the CDP test event lacked Enter's text/unmodifiedText carriage-return payload. After correcting the event, 45/45 passed, exit 0; no product-menu change was needed. Zero console/JS errors; eight blocked favicon requests retained. Test also asserts that focus actually reaches the trigger, preventing a false pass from checking closed state alone. All prior mobile/region/save/filter/sticky/reduced-motion checks remain in this run.

Codex inspected ../shots/R3-DESKTOP-MENU-1440.png: the expanded Deals menu is readable, with visible focus and comfortable rows. This is a labelled component fixture, not the full production page; duplicate fixture chrome is intentional test scaffolding. Updated R3-INTERACTIVE-record.json and the 390px fixture capture. Changed-file lint and diff check pass. No full static matrix rerun was needed because production code is unchanged.

The specific updated desktop-menu geometry/interaction gap is closed locally. R3 remains active with full Next head/body integration, systematic contrast/accessibility, Safari/iOS and independent Claude review still open. PDF phase boundaries and the premium customer-experience direction remain in force; no R4 start or deployment inferred. Codex sole writer; no paid pricing providers, database writes or main-tree edits. Next: remaining R3 integration evidence and reviewer packet refresh when Claude is available.

### R3 actual Next metadata merge: truthful noindex previews (2026-09-13)

Implementation f25323b3cdc325f39f88aeb7cb23a6e24264113b gives plain, unavailable-price and unavailable/expired listing states explicit Open Graph/Twitter previews. They previously returned early without social metadata, inheriting the root layout's promotional below-market description. Current previews mirror the truthful page description, retain the existing noindex/canonical choices and only use trusted listing artwork for displayable records. Unavailable/expired records have no promoted artwork. No body layout, eligibility, affiliate or data-access change.

New tests read the actual root metadata expression and leaf generateMetadata, then execute installed Next 16.3.3 accumulateMetadata against that route stack. Only the resolver's server-only import marker is replaced in this offline Node harness; actual merge/resolver dependencies remain in use. No route server, font build, provider or DB path is executed, and fetch is denied. All three tests reproduced inherited site-wide descriptions before the fix. Final metadata/sitemap/unsupported-price checks: 35/35 pass, exit 0; changed-file lint and diff check pass.

This closes the specific inherited-description merge gap with stronger evidence than leaf metadata objects alone. It is still not full Next server head rendering/streaming, static metadata-file integration, live crawler ingestion or social-platform cache behaviour. No new visual verification claimed for a metadata-only slice. Existing PDF R3 acceptance matrix remains authoritative; Safari/iOS, systematic accessibility/contrast and independent review stay open. Codex sole writer. No production deploy, paid pricing calls, database writes or main-tree edits. Next: remaining route-stack/structured-data acceptance and review packet refresh; R4 remains gated.

### R3 permanent-card offer structured-data parity (2026-09-13)

Implementation a3ae3fece8cd9d58c6ba99d2a92d180392122b0f corrects card-hub Product offers to use the actual listing currency and usable auction current bid, matching the existing listing-route/offer-control contract. Rows with unsupported native prices or missing usable auction bids are omitted from priced structured data; Product is omitted when no supported Offer remains. Neutral description no longer implies every listing has a verified market comparison. Visible inventory, ranking, affiliate destinations, canonical/indexability and breadcrumbs are unchanged. No shipping certainty is invented.

Independent source comparison confirms the old mapping existed at R3 base 631ed35; this is a related pre-existing truthfulness limitation, not attributed as a new R3 regression. Eight new actual-route offline tests all failed before the fix and pass after it. Combined route, metadata-merge and unsupported-price checks: 46/46 pass, exit 0, global fetch denied. New test lint and diff check pass. Card-route lint is NOT clean: its two existing react-hooks/purity errors at lines 229/330 match HEAD exactly in rule/message/severity; no new diagnostics. No build, live route/provider call or new visual verification was performed for this metadata-only change.

Codex remains sole writer; installed Claude reports no active agents. Current R3 work has not received independent Claude review. The existing PDF acceptance matrix remains authoritative. Remaining gates include full Next head/body/static-metadata integration, systematic accessibility/contrast, Safari/iOS and independent review. Next: close remaining R3 integration evidence and refresh the reviewer packet when Claude is available. R4 remains gated; no production push/deployment, paid pricing calls, database writes or dirty-main-tree edits. Stage B stays OWNER_SUSPENDED; original research and the 19 September 2026 GSC note remain unchanged.

### R3 root-image metadata merge and missing-card previews (2026-09-13)

Implementation f6713468804b611d233d7e52d98a9c1a6a4be819 gives missing permanent-card records a truthful unavailable description and explicitly empty social images, preserving noindex/follow and the existing notFound body path. Previously this state inherited the root below-market description and promotional image; source at R3 base 631ed35 confirms this was pre-existing. Existing valid catalogue/hub artwork and canonical remain intact.

Extended actual installed Next accumulateMetadata tests include a simulated root file-image descriptor corresponding to app/opengraph-image.js, plus a control proving the descriptor enters the merge. The missing-card test failed before the fix; six controls passed. After the fix, combined metadata/route/schema suite passes 38/38, exit 0, with global fetch denied. Test-file lint and diff check pass. Route lint remains two pre-existing react-hooks/purity errors, now lines 239/340. An initial exact-message comparison failed because ESLint embeds code-frame line numbers; after inspecting the messages, comparison normalizing only those numbers confirmed otherwise identical diagnostics. No lint-clean claim.

Evidence establishes resolver precedence with a supplied file descriptor, not the real Next static-image loader, generated-image rendering, full streamed head/error-boundary integration or crawler ingestion. No visual changes or new screenshot verification claimed. Codex sole writer; Claude agents list empty, independent R3 review pending. Remaining PDF R3 gates include full Next integration, systematic accessibility/contrast and Safari/iOS; next work should address those acceptance gaps before R4. No deployment, paid providers, database writes or main-tree changes. Existing suspended Stage B and research/GSC backlog remain in force.

### R3 readable secondary text and contrast evidence (2026-09-13)

Implementation 38425a452c8a9500360a6c0e0c577a3c4b37836f improves secondary text colours on listing/permanent-card templates and their shared price, filter, breadcrumb, save and footer components. Light-mode zinc-400 labels were roughly 2.4-2.75:1 on their backgrounds; footer disclosure was about 3.99:1 light / 4.04:1 dark; small auction amber text about 3.2:1. Meaningful labels now use stronger existing neutral/amber shades, with explicit dark variants; two dark red informational links use red-400. Production diff contains only text-colour classes. Brand wordmark, spacing, artwork, hierarchy, prices, affiliate/SEO/storage contracts are unchanged.

New scripts/verifyR3Contrast.mjs runs the actual generated R3 HTML in isolated Chrome, using computed styles, canvas colour conversion and composited solid ancestor backgrounds. It applies 4.5:1 normal-text / 3:1 large-text targets. Known readable/faint/decorative controls verify detection and exclusion behaviour; matrix completeness is enforced. Initial scan failed; before evidence retained at ../shots/R3-CONTRAST-before.json. Final scan: 54 page/scheme/width combinations (nine states, light/dark, 1280/390/320), 4,644 text checks, zero reported failures, exit 0. Decorative aria-hidden marks and brand wordmarks are explicitly excluded; complex paint is recorded as skipped. This is NOT whole-site accessibility certification: overlays, gradients/images, opacity, focus/hover, screen-reader use and real devices remain separate limitations.

Refreshed 72 static captures (nine states, both schemes, 1280/1440/390/320): no overflow or failed images, eight anchor checks pass. Codex visually inspected R3-STATIC-auction-390.png, R3-STATIC-hub_with_offers-320-dark.png and R3-STATIC-bin_compared-1280.png; readable notes retain the compact artwork/price/eBay hierarchy. These are labelled simulated fixtures, not production screenshots. Actual client fixture rerun passes 45/45 interaction checks, zero JS/console errors; eight blocked favicon requests retained. Focused price/schema/SSR tests pass 19/19. New diagnostic lint and diff check pass. Existing production lint errors remain identical to pre-change source: two react-hooks/purity errors in card route and one react-hooks/set-state-in-effect in CardDealFilters at line 125. No lint-clean claim.

The implementation commit completed with exit 0 and verified SHA, but Git auto-maintenance reported permission denied pruning the unrelated .git/worktrees/wt-head metadata. No retry or permission bypass was attempted. Ledger-only commit disables automatic housekeeping for that command to avoid repeating unrelated pruning; no global configuration changes.

Codex sole writer. Claude independent R3 review still pending. Full Next integration, remaining accessibility/contrast states and Safari/iOS remain open in the PDF acceptance matrix; R4 remains gated. Next: finish those R3 acceptance gaps and prepare the stable reviewer handoff. No production deployment, paid provider or database writes; Stage B remains suspended and original research/GSC backlog preserved.

### R3 direct Claude review, sticky correction and coordinator transition (2026-09-13)

Claude independently reviewed stable 38b46c0 (implementation 38425a4), actual diff from 631ed35, source and five requested saved screenshots using authenticated claude.ai Pro subscription. Successful final result retained at ../r3-review-input/claude-review-current.md; raw stream at claude-review-stream.jsonl. Earlier silent attempt was terminated after no verifiable progress and counted as no review. Streaming retry completed, is_error=false, exit 0. A brief live-log reader/writer contention lost some intermediate log events; final result is retained, so this is not a complete tool transcript. Large ledger Read exceeded 256KB; reviewer used appended ledger content in diff, plus current brief/source. No runtime tests executed by Claude.

Confirmed finding 1: StickyDealCta rendered Listing total / Price unavailable / Includes recorded shipping for an unsupported native price. Codex independently reproduced this with the actual component before correction. Claude's requested edit was automatically denied: sensitive-file action required approval, but its non-interactive session had no approval surface. No Claude file changes occurred. Codex submitted the concrete patch through the normal approval flow, then implemented 8e8e2d9 (Suppress unsupported sticky price context). One central hasPrice result gates price label/note as well as the numeric branch; existing CTA/affiliate action remains. Unknown price does NOT prove expiry, so that part of the initial review rationale was not accepted.

Verification: 26/26 offline focused tests; 47/47 actual-client browser checks, including explicit unavailable-label absence at 390/320, existing keyboard/inert/save/filter/affiliate behaviour; zero JS/console errors, eight blocked favicons retained. Changed-file lint/diff check pass. Claude independently re-reviewed the three-file fix and two saved screenshots, verdict RESOLVED, exit 0. Result retained in ../r3-review-input/claude-sticky-rereview-stream.jsonl. It did not independently run tests. This demonstrates direct review -> Codex correction -> Claude re-review. It does NOT demonstrate unattended Claude implementation: that permission blocker is still real.

Open finding 2: permanent-card hero, CardWorthAnswer and CardPriceSummary repeat raw reference summaries. Reconcile this against the premium PDF hierarchy while preserving the crawlable exact-card answer, identity/provenance and existing reference/offer distinctions. Reviewer incorrectly counted CardWorthAnswer's live-listing prose as a link; it is plain text, so do not remove it on that basis. This remains the next bounded design task. Open related R5 backlog: sealed detail still substitutes native total for missing USD; disclosed pre-existing out-of-R3 limitation. Full Next integration, Safari/iOS and remaining accessibility/contrast/screen-reader states stay open. R4 remains gated.

James requested relief from repeated per-command approvals. Current host session is managed read-only despite standing user authorization. Installed Codex CLI confirms --approve-for-me routes approvals through automatic review with workspace-write. Prepared ../r3-review-input/Start-PokemonCoordinator.ps1 and coordinator-start.txt: correct worktree/branch, clean-tree and active-Claude checks, exclusive launcher lock, correct current PDF/ledger context, only handoff and screenshot directories added writable. No global settings, bypass flags or API billing. Launcher syntax and CheckOnly verified; replacement coordinator NOT launched by this agent. User must start it in their terminal after this turn so there remains one coordinator. Effective managed policy can still refuse an action; no guarantee of zero prompts. Interim reliable workflow is Codex as sole writer/coordinator with Claude as read-only reviewer. This preserves independent review without attempting to bypass Claude's sensitive-file denial.

No production push/deployment, paid pricing-provider calls, database writes or main-tree edits. Stage B OWNER_SUSPENDED; original research and 19 September 2026 GSC note retained. Codex has finished this bounded fix and is handing off at a clean committed state; no Claude worker is editing.

### R3 permanent-card answer consolidation (2026-09-13)

Continued from clean 16619c96b3b61bee1b4de39097dda4c23ae5e019 on deal-first-r0r2 after reading the current overhaul Markdown/identical handoff brief and all 15 extracted PDF pages. Current session has workspace-write with automatic escalation review; it replaces the previous read-only coordinator. Codex remains the sole implementation writer. Existing unrelated Claude sessions are left untouched; no recursive agents or additional coordinator launched.

The permanent-card hero now contains the existing crawlable CardWorthAnswer and one offer jump. Removed the added raw-reference hero block and repeated standalone fallback panels. CardPriceSummary and CardPriceIntelligence use an explicit detailsOnly presentation on these two card paths: condition/graded evidence, history windows/direction/coverage and supported listing context remain; repeated raw headlines and the summary's second offer jump do not. Empty evidence panels are omitted. Existing answer identity, USD text, condition/printing provenance, first-edition exclusion, dated source, unavailable/reference distinction and plain live-listing sentence remain. The answer stays explicitly USD; additional condition/graded prices and actual offers retain their existing currency conversion. No change to metadata/schema/canonical, provider/cache selection or affiliate destination construction. History/variant sections remain below.

Verification: 56/56 focused offline route/summary/price/metadata/schema checks pass, exit 0, with provider dependencies replaced and fetch denied. New tests preserve fallback rejection, known/unknown condition, edition/date/identity, one offer jump, additional AUD prices, suppressed-grade wording and trend evidence. Initial tests could not spawn under the sandbox (EPERM); the normal escalation review allowed the same offline workers. Two initial assertions exposed an additional repeated CardPriceIntelligence headline, corrected. Moving actions into the answer required replacing the old child stub with real CardWorthAnswer in the price-rendering harness; two temporary sponsored-link assertions then passed. These failures were not counted as passes.

Saved before captures in ../shots/r3-summary-before. Refreshed 88 labelled static captures (11 states, light/dark, 1280/1440/390/320), no overflow or failed images/blocked requests; eight offer-anchor checks pass, exit 0. Added catalogue-rejected and live hub condition/graded evidence fixtures. Codex inspected 390 live/reference-only, 320 dark live, 1280 graded-evidence and rejected-reference pixels. Initial action placement was too low on mobile; moved it ahead of the printing details, retaining the evidence. Current simple live-hub 390/320 screenshots show the offer action within the 900px viewport, not an all-state first-fold guarantee.

Expanded contrast coverage found faint low-sales labels and variant/history text, corrected with stronger existing neutral/amber shades. The diagnostic's old hardcoded 54-combination assertion initially failed after fixture expansion; completeness now derives from the manifest. Final 66 combinations / 5,776 text checks / zero reported failures, exit 0. Existing complex-paint/focus/hover exclusions remain. Records: ../shots/R3-STATIC-record.json and R3-CONTRAST-record.json. Node module-type reparsing warnings are tooling noise, not runtime errors. No client interaction bundle was changed or rerun; static anchors are exercised, but full Next hydration, production ingestion, Safari/iOS and screen-reader proof remain unavailable.

Changed non-route files lint pass, exit 0. Card route lint remains exit 1 with two Date.now purity diagnostics, independently matched against 16619c9 by rule/severity/message heading; no clean whole-route lint claim. Stable-commit independent Claude review is next, read-only over exact diff and saved images, maximum three rounds. R3 remains active and R4 gated. Sealed-detail native-as-USD fallback remains the recorded R5 task. No production push/merge/deploy, paid provider calls, DB writes, scanner/cron/email activation or main-tree edits. Stage B OWNER_SUSPENDED; outreach parked; original research and the 19 September 2026 GSC note retained.

R3 summary review round 1: Claude Pro independently inspected stable c72e21a, diff/source, all five requested images and the optional before-image. Process exit 0, is_error=false, no permission_denials; ../r3-review-input/summary-review-current.md and summary-review-stream.jsonl retain the result. Verdict: duplication genuinely fixed, but one low-priority regression remains: removing the rejected-reference fallback panel lost its nearby methodology link. Codex independently confirmed this and restored the link inside CardWorthAnswer's unavailable paragraph, with a regression assertion scoped to that paragraph (a footer link cannot satisfy it). Seven summary tests and changed-file lint pass, exit 0. Refreshed 88 captures/eight anchor checks pass; Codex inspected the rejected-reference desktop image showing the restored link. No claim of a new full contrast or interactive suite run for this reused link style.

Review launch evidence: the first sandboxed attempt never reviewed source; session startup returned EPERM and connection retries ended with exit 1/is_error=true/ConnectionRefused. Normal automatic escalation review then allowed the same read-only CLI invocation using existing claude.ai Pro auth, without bypass flags or edits. Its successful review is recorded separately from ../r3-review-input/summary-review-sandbox-failed.jsonl and summary-review-sandbox-process.json. Worktree Git metadata likewise required the normal escalation path for the local commit; gc.auto=0 prevented unrelated housekeeping. No approval denial was bypassed. The follow-up fix now needs a narrow round-2 Claude re-review; R3/R4/release gates and all standing suspensions remain unchanged.

R3 summary round 2 closeout: stable implementation 8f6a8f19fcc4295b38e23fcac4bb520dfa51f002 (consolidation c72e21a6b55eca78540921eda21332a5d7384718) independently re-reviewed by Claude over the exact component/test diff, source and saved rejected-reference screenshot. Verdict RESOLVED, process exit 0, is_error=false, permission_denials empty; ../r3-review-input/summary-followup-review-current.md, summary-followup-review-stream.jsonl and summary-followup-review-process.json retain evidence. Claude confirms the paragraph-scoped link assertion cannot pass on the footer and the screenshot displays the restored contextual link. It did not run tests. The bounded repeated-reference-summary finding and its follow-up regression are complete in two successful review rounds; the failed sandbox connection attempt was not a review. Codex remains sole writer; unrelated Claude sessions and main working files untouched.

Next gate stays within the existing R3 ledger: remaining full Next runtime/head/body integration and accessibility/Safari/iOS/screen-reader evidence require their own bounded verification; this closeout does not claim them or advance R4. R3 owner/detail review and explicit production authorisation remain required before subsequent phase/release gates. Current evidence is local/provider-isolated only. Stage B OWNER_SUSPENDED, outreach parked, original research and 19 September 2026 GSC note retained; no production action authorised or taken.

### R3 main landmarks and keyboard bypass (2026-09-13)

Continued from clean 06e0f9f60b48fed0b7fffbb768fc4ddc7f10a601. Source inspection of the root layout and actual R3 templates confirmed no main landmark or navigation-bypass link. Added a native SkipToContent anchor before SiteHeader on listing and both permanent-card render paths, with a matching main#main-content tabindex=-1 and scroll margin for the sticky header. The focus-only link has a 44px minimum height and a visible outline. Existing content containers retain their layout classes; footer/header stay outside main. This is scoped to R3 templates, not a new whole-site accessibility audit. The /deals category delegation and Next's own 404 remain untouched.

Actual lifecycle inspection corrected an initial test assumption: inactive listings redirect to their exact permanent card, and missing records use notFound, so neither renders the temporary unavailable panel. Tests now preserve those two controls explicitly; the active but display-gated panel gets its own main landmark and a new labelled display_gated fixture. No availability/eligibility, pricing, metadata, affiliate destination, provider/cache or storage changes.

Verification: 62/62 provider-isolated route/markup/summary/metadata/schema/lifecycle tests pass, exit 0. Before edits, live listing/catalogue/hub tests reproduced the missing landmark; two initial inactive/missing cases exercised redirect/404 instead and were corrected, not treated as failed rendered pages. Existing renderer replaces providers before route evaluation and denies fetch. Updated scripts/verifyR3Static.mjs uses actual Tab/Enter/Tab CDP keyboard events, checks first-link visibility/44px geometry, main focus after activation and the next focusable element inside main, plus Chrome's exposed accessibility tree (one main and one named H1). It does not directly focus the link/target to make assertions pass; only document-start focus is reset before keyboard traversal.

Browser: 96/96 navigation checks pass at 1280/1440/390/320 in light/dark over 12 states; 96 standard captures, eight offer-anchor checks, no overflow, failed images or blocked requests, exit 0. ../shots/R3-MAIN-NAVIGATION-record.json and R3-STATIC-record.json retain records; R3-SKIP-{bin_compared,display_gated}-{1280,320}-{light,dark}.png show focused links. Codex inspected narrow dark listing and desktop light display-gated pixels. Focus navigation works in the native-anchor static fixture without hydration; this is NOT a real screen-reader, Safari/iOS, full Next runtime/head/body or route-announcer pass. No claim of comprehensive accessibility certification. Contrast matrix was not rerun for the existing black-on-white focus styling; actual focus pixels/geometry were inspected.

Changed non-card-route files lint pass, exit 0. Card route still has the two recorded Date.now purity diagnostics, independently matched to 06e0f9f by rule/severity/message heading, so no whole-route lint-clean claim. Diff check passes. Codex remains sole writer. Next: commit and one bounded Claude read-only review of exact source/diff and navigation/focus evidence, maximum three rounds. R3 remains active; remaining Next runtime and unavailable-device evidence stay open before R4. Stage B OWNER_SUSPENDED, outreach parked, research and 19 September 2026 GSC note preserved. No deploy/push/merge, paid provider call, database write, scanner/cron/email activation or main working-tree edit.

R3 main-navigation independent review closeout: Claude Pro reviewed stable 9cc1e0489cc759f2616ce82647b9b7a1464d0c9f against 06e0f9f, actual source, keyboard/AX checks, representative record entries and both requested focus screenshots. Verdict PASS, process exit 0, is_error=false, permission_denials empty. Evidence: ../r3-review-input/main-navigation-review-current.md, main-navigation-review-stream.jsonl and main-navigation-review-process.json. It performed read-only inspection, not an independent browser/test run. Codex assessed its findings: no blocking defect; the automated 44px check covers height and viewport bounds, while screenshots/recorded left/right geometry establish the existing link is comfortably wider than 44px (no automated minimum-width claim). Bounded main-landmark/keyboard-bypass task complete in one review round.

Reviewer separately noted the unchanged "This deal has ended" heading can describe a still-active, temporarily display-gated row. Source confirms that wording predates this slice; record for a separate bounded R3 truthfulness follow-up, not a new whole-site audit or a change to inactive redirect/notFound handling. Remaining full Next runtime/head/body/route-announcer, Safari/iOS and actual screen-reader evidence stays open. R3 remains active, R4 gated, no deployment approval inferred. Codex remains sole writer; Stage B OWNER_SUSPENDED, outreach parked and original research/19 September 2026 GSC note remain preserved.

### R3 truthful unavailable copy and actual Next runtime evidence (2026-09-13)

Continued from 3fb830eb11e8396e634259bea6c2bed75061e9a1 on deal-first-r0r2. Codex remains sole implementation writer/coordinator; existing unrelated Claude sessions untouched. The active display-gated listing panel now says "This listing is unavailable here" and explains that failure of our listing checks does not confirm sale/expiry on eBay. Early-release wording, inactive exact-card redirect, missing-record 404, eligibility, affiliate destinations, metadata and provider/cache contracts are unchanged. Six landmark/lifecycle tests include assertions for the truthful panel and absence of a direct listing CTA.

Added test-only scripts/buildR3NextFixture.mjs, runR3NextFixture.mjs, verifyR3NextRuntime.mjs and tests/browser/r3/runtime. They build/start an isolated credential-free application inside ignored .next/r3-runtime using actual R3 route/root-layout source, actual installed Next 16.3.3 production-mode rendering, metadata-file loader, shared client components and cache wrappers. Production provider/database/email/analytics transports are replaced before compilation; a module exclusion assertion and preloaded fetch/HTTP/socket restriction independently constrain I/O. Browser allows fixture loopback and reference artwork only. Declared boundaries: root Google fonts replaced with existing offline Geist CSS; Next Script/analytics transports stubbed; image optimisation disabled; listing static params fixture-only. Production app config/dependencies remain unchanged. Source hashes and boundaries: ../r3-review-input/next-runtime-manifest.json; reproducible commands in tests/browser/r3/runtime/README.md. Never rebuild while the fixture server is running.

Verification: 81/81 focused provider-isolated route/summary/metadata/schema/price/lifecycle tests pass, exit 0 (r3-closeout-tests.txt); changed-file lint and diff check pass, exit 0. Existing card-route purity diagnostics elsewhere remain; no whole-project lint claim. Isolated Next production build passes, exit 0 (next-runtime-build.txt/build-process.json), including real root opengraph-image rendering. Early attempts failed on Windows ESM config URL and incomplete fixture analysis arrays; a repeat retained old unstable_cache results. Corrected test contracts/config and added verified fixture-cache clearing before builds; these failed attempts are not counted as passes.

Actual Next runtime final result: **162/163 checks pass, exit 1**, deliberately retaining a real unresolved cold-redirect failure described below. Thirty labelled screenshots over ten states at 1280/light, 390/light and 320/dark; one main, keyboard Skip activation, no whole-page overflow and loaded artwork pass. HTTP initial HTML/title/canonical contracts, structured-data records, missing-record 404, native USD then AUD hydration, real save handler/reload persistence, actual Next client transition with retained document identity, updated title/canonical and nonempty route-announcer DOM pass. Actual affiliate handler reaches both stub transports; sponsored destination/customid retained, outbound default prevented. This is not provider/SDK ingestion. Codex inspected 1280 listing, 390 display-gated and 320 dark permanent-card screenshots: hierarchy, truthful text and exact-card answer/action retained. Record and HTML: ../shots/r3-next-runtime/record.json; next-runtime-browser.txt/process.json retain exit status. Existing broader static/contrast/interactive evidence remains applicable; it was not all rerun.

Error classification: final browser has zero captured JS exceptions/console errors and zero unexpected external requests. All 97 HTTP 404s are explicit fixture responses for recorded out-of-scope local prefetch/navigation paths; all 97 canceled requests match those excluded URLs. They are limitations of this bounded app, not proof those production routes work/fail. An initial run allowed category prefetch to reach the throwing test-only category boundary (UNEXPECTED_FIXTURE_CATEGORY); initial server log retained separately. Final server log is clean. Own fixture server stopped normally (wrapper exit 0, recorded child termination); own Chrome instances closed. No live log is needed for the completed evidence.

**Unresolved installed-framework cold redirect:** first uncached responses from the actual inactive listing and an independent minimal Next-only permanentRedirect control each emit two identical Location headers; cached responses emit one. Node's default redirect follower combines them into /cards/fixture-hub,%20/cards/fixture-hub and receives 404. Exact raw headers, cache MISS/HIT and follow result: next-runtime-redirect-control.json and next-runtime-cold-follow.json. The verifier now always includes a fresh framework-only control and fails it, so warm browser passes cannot hide it. This reproduces without deal-page logic; no claim of production proxy/browser impact or introduction by R3. No dependency update, node_modules patch, custom server or caching workaround applied. It remains a runtime/release acceptance issue requiring a separate bounded decision consistent with installed-dependency and preserved-caching constraints.

Remaining limits: this is actual Next on isolated inputs, not a full production app build, live provider integration, crawler ingestion, production hosting, Safari/iOS or real screen-reader proof. Unavailable browser/device evidence is recorded as required by the current brief, not claimed passed. R3 remains active pending independent review and the cold-redirect disposition; R4 still requires the detail-review/owner gate. Next: stable exact-SHA read-only Claude review of this copy/evidence slice, maximum three rounds; then record verdict and unresolved framework issue. No push/merge/deploy, paid pricing requests, DB writes, scanner/cron/email activation, outreach or main working-file edits. Stage B OWNER_SUSPENDED; sealed-detail native-as-USD remains R5; original research and 19 September 2026 GSC note retained.

R3 next-runtime review round 1: Claude Pro PASS for bounded copy/evidence changes at 49b3bed384b9a96accd96cf1bd8fb7c471e037b0; process exit 0, is_error=false, permission_denials empty. It inspected exact diff/source, all three requested screenshots and saved records, without executing tests. Evidence: next-runtime-review-current.md, next-runtime-review-stream.jsonl, next-runtime-review-process.json. It agrees cold duplicate Location remains an open framework/runtime acceptance issue and does not approve full R3. Reviewer called the inactive fixture a "gated-listing redirect" once; source/fixture correctly has is_active=false. No new product finding requires correction.

Codex independently noticed and corrected a test-only /api/rates shape mismatch: marketplace AU -> EBAY_AU, geoCountry -> geo_country, matching app/api/rates/route.js. Added an explicit served-response shape check. No production change. Clean isolated rebuild exit 0; changed-file lint/diff check exit 0. Refreshed 30 captures and re-inspected desktop listing. Latest cold-cache runtime: **162/164 pass, exit 1**. Two failures are the same known defect: fresh framework-only control and this time the actual inactive listing's first response (previous 162/163 run had already warmed that listing). Both have duplicate identical Location, not a new defect from region fields. All other checks including new rates shape pass; final 97 HTTP404/97 canceled requests match excluded local paths, zero unclassified/captured JS errors/unexpected external requests. Own fixture server stopped, wrapper exit 0; production remains untouched. Round-2 narrow read-only review of the fixture contract correction/updated evidence is next. R3 active, cold-redirect disposition and owner/detail gate remain; R4 not started.

R3 next-runtime round-2 closeout: Claude Pro PASS at 27a1b141693648ad596bc0befd73bf60ec0edbef for the test-only API-contract correction and updated evidence; process exit 0, is_error=false, permission_denials empty. It inspected the precise two-script diff, real API source, served-response record, final failures/process status and refreshed desktop screenshot. It did not execute tests. Evidence retained in ../r3-review-input/next-runtime-followup-current.md, next-runtime-followup-stream.jsonl and next-runtime-followup-process.json. Codex independently accepts the verdict; no actionable finding or disagreement remains in this bounded copy/fixture task. Two successful review rounds, no denied-edit retries, no agents launched by Codex; unrelated Claude sessions left untouched.

Bounded task complete locally and independently reviewed. **Full R3 is NOT accepted/complete:** cold uncached redirect behaviour remains an explicit failing runtime gate (latest 162/164, exit 1); Safari/iOS and real screen-reader use remain unavailable/unverified, with other isolated-environment limits above. Next within the existing phase ledger is disposition of that narrowly reproduced installed-Next redirect issue under the existing dependency/caching constraints, then R3 detail/owner review before R4. No R4 implementation or deployment approval inferred from the request to finish. Own fixture PID 40588 verified stopped; worktree changes committed, no production action. Codex sole writer; Stage B OWNER_SUSPENDED, outreach parked, sealed fallback R5 and original research/19 September 2026 GSC note retained.

### R3 cold redirect root cause and client impact (2026-09-13)

Continued from clean f7caf9a7e000eaa809fcf12b7a882f2d888dace3. Installed Next matches package.json/package-lock at 16.3.3; Node is v24.19.0. Read installed redirect/permanentRedirect and adapter configuration docs. Local source tracing: app-render/app-render.js sets Location during redirect rendering (around 5902); build/templates/app-page-runtime.js around1181-1200 replays cached headers with native res.appendHeader. Next's base-http/node.js wrapper already deduplicates identical appendHeader values, but that native replay does not use it. This explains cold MISS duplication followed by single-header HIT without blaming application eligibility/redirect selection. Dependencies were only read, not patched.

Added scripts/diagnoseR3Redirect.mjs using the existing provider-isolated fixture/build and sibling evidence folders. It compares raw HTTP cold/warm, a separate fresh Node fetch redirect, and another fresh installed Chrome navigation; paths are unique per run to avoid warming the browser case. Final diagnostic exit1 is intentional: raw single-Location check false, Node destination false, Chrome destination true. Chrome152.0.7977.84 follows the cold MISS308 despite two Location values to the correct /cards/fixture-hub, showing the named exact-card answer. Node fetch joins the values and reaches a comma-containing path with404. Chrome request record confirms MISS plus duplicate values, so this is not a warm-response false pass. Zero captured Network.loadingFailed or unexpected external requests; no comprehensive console/performance audit claimed. Saved ../r3-review-input/r3-redirect-diagnostic.json, redirect-diagnostic-run.txt/process.json and ../shots/R3-COLD-REDIRECT-CHROME.png. Codex inspected the actual destination screenshot; final capture includes a simulation label. Changed-script lint/diff check exit0. The existing 162/164 runtime suite was not rerun or reclassified by this narrow diagnostic. Own fixture server stopped normally; no product code/cache/provider/affiliate change.

Narrow public upstream lookup corroborates the source finding: https://github.com/vercel/next.js/issues/82117 is marked confirmed; https://github.com/vercel/next.js/pull/95913 is an OPEN proposed fix as observed today. It proposes replaying through the existing deduplicating response wrapper. No released remedy was established by this lookup. A contributor reports intermediary/header-folding impact; that is not verified on this project's production host. Do not describe the local Chrome success as proof of production proxy, HTTP2, crawler, Safari/iOS or all-browser safety. No upstream comment/message was sent.

Remedy assessment within current authorisation: removing static generation/forcing dynamic changes the explicit cache/cost contract; moving lookup/redirect into Proxy changes request/provider/cache architecture; rewriting published framework internals or introducing an adapter is a broader compatibility maintenance choice, not a page-copy fix. None applied. A dependency update is neither authorised under 'existing dependencies only' nor shown to contain the still-open upstream proposal. Keep the release/runtime compatibility issue open, now accurately described as client-dependent rather than a demonstrated Chrome destination failure. A significant owner decision is needed before changing the redirect/caching architecture or accepting this known limitation for phase review. Next: bounded Claude read-only review of diagnostic/source/evidence and this disposition, then owner decision; R3 active, R4 and deployment gated. Codex sole writer; Stage B OWNER_SUSPENDED, outreach parked, R5 sealed fallback and original research/19 September GSC note preserved.

Cold-redirect diagnostic independent review round1: Claude Pro PASS at8dd207ccc9cd3183a8d57c7c6e7989fa6e3b8641, process exit0/is_error=false/permission_denials empty. It inspected raw MISS/HIT, separate Node and Chrome cases, actual destination screenshot and installed framework source. No actionable finding. Minor notes: combined singleLocation boolean requires reading raw entries to distinguish MISS/HIT (raw evidence retained); lint/diff artifact was not supplied (now retained in redirect-diagnostic-lint.txt/process.json). Reviewer wording 'no external calls' is too broad: reference artwork is explicitly allowed; our claim remains zero unexpected external requests. Review is inspection, not independent execution. Evidence: redirect-diagnostic-review-current.md/stream.jsonl/process.json.

**Concrete local remedy probe, not adopted:** added opt-in --probe-dynamic-listings to the existing fixture generator. It removes generateStaticParams only from the generated copy of the actual listing route, preserving all original provider/data-cache wrappers and production files. New scripts/probeR3DynamicRedirect.mjs verifies the generated mode, two live-page requests, exact single308 Location and Node-follow destination. Clean isolated build exit0, four checks pass/exit0. Measured live and inactive responses carry `private, no-cache, no-store, max-age=0, must-revalidate`; no x-nextjs-cache. Node now reaches /cards/fixture-hub with200. This proves the workaround AND its loss of page-render caching; it does not measure provider-call counts, production bills or category rendering. Since generateStaticParams also enumerates delegated /deals/<category> routes, applying this production change would remove their build-time generation too. Existing 60s deal/300s price data-cache source is retained, but equivalent end-to-end cost is not claimed.

Probe evidence is separate: dynamic-probe-build.txt/process.json, dynamic-probe-manifest.json, r3-dynamic-redirect-probe.json, dynamic-probe-run.txt/process.json. Own server stopped. Generated ordinary fixture restored without the flag and rebuilt successfully (redirect-baseline-restored-build.txt/process.json), so the dynamic experiment is not silently left enabled. No production source/config/dependency/lockfile change. README documents explicit opt-in and restoration. Owner decision can now review an actual measured alternative: approve removing full-page prerender/cache for the shared /deals/[id] route while retaining data-cache code, or keep the upstream compatibility issue open under the existing cache constraint. R3 remains active; no R4/deployment approval inferred. Next: narrow round2 read-only review of the test-only remedy probe, then request that specific caching exception. Standing suspensions and research/GSC preservation remain unchanged.

Cold-redirect remedy probe independent round2 closeout: Claude Pro PASS atf330fc8f3d94d636ea0dafdf8f3dbd030f07437f; process exit0, is_error=false, permission_denials empty. It inspected exact diff, probe raw responses/build logs, default restoration, README and actual route staticparams. No actionable defect. Codex accepts the bounded verdict with one factual correction: reviewer called the restored seven numeric fixture paths 'category paths' and said category loss was empirically verified. Those are fixture LISTING IDs. Category generation impact is inferred from the actual shared generateStaticParams source; category rendering/caching remains untested, exactly as our probe limitation states. That reviewer overstatement adds no category acceptance evidence. Files: dynamic-probe-review-current.md/stream.jsonl/process.json.

Diagnostic and opt-in remedy measurement are complete and independently reviewed in two rounds. Production route/data-cache/dependencies remain unchanged; ordinary fixture mode verified restored (dynamicListingProbe=false), own server verified stopped. Local prototype succeeds only by giving up full-page cache; source-retained data caches do not prove unchanged cost. **Owner decision now required by the standing preserve-caching instruction:** whether to authorise applying removal of generateStaticParams to the shared listing/category route, with its measured no-store/full-render effect, or retain current caching and the known upstream compatibility gate. No R3 completion, R4 start, deployment, dependency installation, provider calls, DB writes or main-tree working-file edits inferred. Existing suspensions and original research/19 September2026 GSC note retained. Codex remains sole writer; unrelated Claude sessions untouched.

### Owner-approved R3 redirect implementation and full-overhaul release intent (2026-09-13)

Owner explicitly approved the measured caching workaround and instructed continuing all PDF work toward going live today. This authorises the shared /deals/[id] page-cache exception, remaining overhaul implementation and release after evidence/review gates; no repeated deployment question is needed merely because older entries said deployment was unauthorised. It does NOT authorise paid pricing calls, DB writes/migrations, scanner/cron/email activation, outreach or unrelated main-tree changes. Stage B remains OWNER_SUSPENDED. Today is a target, not evidence that unfinished checks pass; R7 outcome evaluation still requires adequate post-release data and the existing 19 September GSC note remains.

Removed generateStaticParams and its now-unused category-slug import from the actual shared listing route. Documented intentional full-page/category-prerender loss while preserving 60s deal and300s price caches, client currency/region, URLs, metadata, eligibility and exact-card redirect selection. No dependency/config change. Fixture generator now copies that route unchanged (retired opt-in transform); the existing probe verifies current approved behaviour. Main runtime retains the still-defective minimal ISR framework control as diagnostic evidence separately from production-route acceptance; it does not claim Next itself is repaired. Actual DealCategoryPage is now used with fixture data dependencies to test vintage HTML/canonical/listing link and sealed308 delegation.

Verification:81/81 provider-isolated regressions exit0; actual isolated Next build exit0;165/165 actual-route HTTP/browser checks exit0, zero captured console/JS errors/unexpected external requests. Four cache/redirect checks exit0 confirm no-store page responses and single308/exact200 destination. Thirty refreshed screenshots; Codex inspected390 listing pixels, retaining identity/reference image, honest AUD comparison and visible eBay action. Existing keyboard/hydration/save/handler/metadata checks remain in the run. Test-only cold ISR control still reproduces duplicate Location, explicitly outside the dynamic production route; broader R6 redirect inventory will use this evidence. Safari/iOS/screen-reader/production provider/cost/crawler limitations remain. Changed-file lint/diffcheck pass; unrelated historical lint diagnostics are not claimed fixed. Evidence r3-approved-redirect-{build,tests,browser,cache,lint}.txt and matching process.json in ../r3-review-input; browser record ../shots/r3-next-runtime/record.json. Own server/Chrome stopped.

Fresh git fetch origin main exit0: origin/main8b16321395153f49bc303ffc2b10e8495a61ba9a equals merge-base with HEAD; no incoming divergence. No push/merge/deploy yet. Codex sole writer. Next: exact-commit Claude read-only review of approved cache implementation; then R4 catalogue utility under the same ledger and user's expanded authorisation, followed by R5/R6 reviewable slices. No broad competing roadmap. Existing research, original provenance, R5 sealed native-as-USD finding and suspended growth tasks remain preserved.

### R3 closed; R4 catalogue utility active (2026-09-13)

Claude's read-only review of e9bc69480cde3ee8d54e9b1568502af4b05b193e returned PASS, exit0/is_error=false/permission_denials empty, with no actionable finding. Exact source, diff, actual Next records and screenshot inspected; review-current.md, stream and process files use the r3-approved-redirect-review prefix in ../r3-review-input. Codex independently accepts the bounded verdict; remaining Safari/iOS, screen-reader, production-provider/cost and crawler limits are not claimed passed. R3's known cold-ISR framework control remains diagnostic only, with the approved shared listing/category workaround verified. R3 is closed for progression into R4.

Owner subsequently delegated remaining product decisions and explicitly requested continued implementation and go-live without additional approval pauses. Proceed through existing R4/R5/R6 review gates autonomously; this supersedes historical owner-pause instructions, not actual permission/authentication protections. No further coordinator/recursive agents. Codex remains sole writer, Claude read-only reviewer; Stage B OWNER_SUSPENDED, outreach parked, research and 19 September GSC note preserved. Release is authorised after checks; no production action has yet occurred.

R4 implementation: set/species full inventories move ahead of price summaries and deal grids, with compact identity and contextual deal jumps. New CatalogueViews keeps primary server-rendered list and alternate search/gallery mounted, preserving link population and checklist state. Set header duplicate back navigation/logo removed; supporting market explanation uses native details and complete numbering notes remain after the checklist. Existing identity guard, raw references, provenance, set/storage keys, reset/missing controls, gallery cap, metadata, schema and data-cache logic retained. Species never gets owned controls. Skip/main navigation added to both species paths and sets. No provider/data writes.

R4 verification uses the existing R3 provider-isolated actual Next generator/runtime, extended with actual set/species routes. Recovered historical saved RSC cards and exact links for Jungle64/Neo Destiny113/Dragonite75; Boundaries Crossed153 uses saved 17C.12 row identities, simulated prices and numbered fixture URLs. These are explicitly offline historical/simulated inputs, not live market facts or proof that production URLs resolve. The first fixture accidentally reused display-name slugs and correctly triggered the identity fallback; corrected without changing the production guard. Browser then exposed blank PDFs from an important Tailwind hidden rule; fixed print override in the same base layer. Printed checkbox labels now remove screen touch-height padding. Earlier failed evidence is not counted as final acceptance.

73 existing offline checklist/reference/species regressions pass after updating five source-layout assertions for compact logo/notes placement (semantic/storage/identity expectations unchanged). Isolated actual Next build passes. Final browser/print evidence and independent stable-commit review pending; do not mark R4 complete yet. Main working files and unrelated Claude sessions untouched.

R4 final implementation evidence: isolated Next build exit0;93/93 HTTP/browser checks exit0;73/73 regressions exit0;changed-file lint and diff check exit0. Browser includes initial full historical/simulated link populations, one main/H1, native keyboard skip, 1280/390/320 light/dark layout and explicit inner-table fit, list/gallery switches, owned persistence/missing/reset/focus and honest storage-failure text. Zero captured runtime errors/unexpected external requests. Forty-five matrix screenshots plus storage-failure capture; Codex inspected desktop/mobile list/gallery and320 dark pixels. A screenshot caught internal table clipping that the page-level width check missed; added an explicit table-fit assertion and fixed narrow column widths. Below360px artwork is omitted from the list while name/number/rarity/price remain; the gallery retains art.

Actual missing-only PDF export from the gallery now passes: Jungle63 rows/3pages, Neo Destiny112/4, Boundaries Crossed152/6. pypdf verified exact normalized collector-number sets and scope text, with every page nonempty; browser verified no embedded image objects. Installed Windows PDF renderer produced all13 page PNGs; Codex inspected their contact sheet and full-size first/final pages (no blank pages, clipping or split rows seen). This uses existing Windows/pypdf dependencies, not installed packages. Initial Windows renderer invocation emitted a nonterminating async-adapter error despite exit0; corrected adapter and Stop-on-error, reran successfully before accepting pixels. Records: ../shots/r4-catalogue/record.json and print-record.json, r4-{runtime-build,browser,regressions,lint}.txt and process.json in ../r3-review-input. Provider-isolated only, with declared historical/synthetic inputs; no live crawler/production provider/Safari/iOS/screen-reader or user-study proof. Own fixture server/Chrome stopped.

Next: bounded exact-commit Claude read-only review of R4 layout, print and preserved contracts (max3 rounds); resolve any actionable findings, then R5 under delegated owner authority. No release has occurred; Stage B/outreach restrictions remain.

R4 independent review closeout: Claude Pro PASS on 01f8d998f677d33a12b1ce371024334163ac1647, process exit0/is_error=false/no permission denials. Actual source, saved record/logs and multiple screenshots/13-page print contact sheet inspected. No blocking defect; explicitly supports R5 progression under owner delegation. Evidence r4-layout-review-current.md/stream.jsonl/process.json in ../r3-review-input. Codex accepts verdict, with the reviewer caveat that reading source/evidence is not independently executing the tests.

Moved one misplaced SetReferenceNotes comment as requested. Reviewer correctly spotted a vacuous Cleffa initial-link expectation (zero expected, although its separate browser rows test exercised four rows). Corrected future verifier to require a nonempty expectation and explicitly use the four synthetic control links. A separate check of the saved actual-Next Cleffa initial HTML verifies all4 links, exit0, recorded in r4-cleffa-links-followup.json. Do not count the original Cleffa line as link-parity proof. Four principal pilot expectations were already nonempty. Independently compared saved Dragonite baseline and fixture:75 unique destinations, none added/missing. These are test/comment follow-ups, not product changes; reviewer explicitly does not require a further cycle for the comment. R4 complete for progression; R5 active next. R6 full cross-family/production-readiness gates remain; no production deployment yet.

### R5 sealed offer presentation (2026-09-13)

Codex sole writer. Sealed cards/details now use the existing trustworthy USD helper instead of treating native currency as USD; missing listing/reference prices suppress savings and misleading zero values. Shipping qualifiers are visible, unknown shipping has no comparison claim, auction schema uses current bid and confirmed shipping only. Unavailable copy does not infer sold/ended. Compact product art/identity, readable contrast, exact listing/auction actions and Skip/main navigation follow the approved system. Existing product identity/eligibility, provider caches, affiliate wrappers and release guards retained.

Provider-isolated actual Next fixture now includes eight simulated sealed states, actual tiles/details, and current Tailwind source compilation with saved offline Geist fonts. Fixture identity/URL mistakes were corrected without weakening production guards. Build exit0;52/52 focused regressions exit0;299/299 HTTP/browser checks exit0;changed-file lint/diff check exit0. Browser preserves earlier R3 checks, classifies excluded local prefetch404/cancellations, records zero captured JS/console errors/unexpected external requests. Fifty-five route captures plus tile capture; Codex inspected current390 missing-reference and320dark native-CAD pixels, plus auction/unpriced screenshots in prior passing run. Initial case-sensitive Current bid assertion failed because CSS uppercases the rendered label; corrected assertion, no product workaround. Final records r5-sealed-{build,tests,browser,lint}.txt/process.json in ../r3-review-input, ../shots/r5-sealed-runtime/record.json. Fixture has no provider credentials and compile/network guards; live provider accuracy/cost, full-app runtime, crawler ingestion, Safari/iOS and real screen-reader use remain unverified. Own fixture server stopped. Next: bounded stable-commit read-only Claude review, then remaining R5 families; no production release yet. Stage B suspended, outreach parked, original research and19 September GSC note preserved.

R5 sealed independent review: Claude PASS at9f82dbf, process exit0/is_error=false/permission_denials empty; source and four screenshots inspected, not independently executed. Evidence r5-sealed-review-current.md/stream.jsonl/process.json. Codex accepts the bounded verdict with two corrections: reviewer speculates scanner fields cannot drift; this is not proven and is not acceptance evidence. Its suggested missing-bid auction schema issue is not emitted by the actual code: Product requires showSavings && (!isAuction || auctionParts). The fallback object alone is not an emitted Product. No actionable regression or disagreement remains. Continue remaining R5 families under delegated authority; no production release yet.

### R5 remaining families acceptance evidence (2026-09-13)

Directories and Japanese/sealed/latest headers are compact and consistently navigable. Sets/species filters have readable names, generous controls and result feedback; every1025 species link and all fixture set/guide destinations remain in initial HTML. Sealed product-type controls expose pressed state and retain pack/box labels and existing rendering budget. Japanese/sealed scan labels show the recorded refresh age instead of substituting an automatic/live assurance. Guide hub groups the seven existing guides by task; shared GuideLayout supplies collapsed native contents linked to real headings and16px reading text. All six trust pages and research now have Skip/main, consistent reading width and readable prose; original illustrated content, research sample/window/citations, metadata and factual update dates are retained. Privacy's long scope URL wraps at320px.

Saved/recent cards retain existing storage keys/handlers/caps, label prices Last seen, and preserve native currency when either FX rate is unavailable. No account/sync/current-availability promise. Alert fields have accessible names, explicit USD target, larger controls and error/status feedback; existing opt-in/confirmation/payload/cadence unchanged and sending is not activated. Fixtures intercept alert POSTs locally; no email or DB writes.

Final provider-isolated Next build exit0;37/37 existing alert-currency/guide-link/release regressions exit0;226/226 browser/HTTP checks exit0 across27 routes at1280/390/320 including dark, all seven guide contents targets, keyboard Skip, set/species/sealed filtering, Japanese sparse state, dated-study citation, saved persistence/dedupe/remove, and intercepted alert error/confirmation/payload. Changed-file lint exit0 and diffcheck pass. Zero captured runtime errors/unexpected external requests; HTTP404s and canceled local prefetches explicitly classified.81 matrix screenshots plus5 interaction captures. Codex inspected guide hub/article, current research, narrow species, saved-state and trust screenshots. Initial run exposed missing main landmarks on two research articles and a long privacy URL overflow; fixed and rerun. A missing fixture slugifySet export failed the first build, corrected only the fixture. First offline test attempt failed worker spawn EPERM; authorised escalation succeeded, no auto-review denial bypassed. Evidence r5-families-{build,tests,browser,lint}.txt/process.json and ../shots/r5-families/record.json. Same established provider-isolated generator, no new runtime/dependencies; limitations include full production app/provider data/cost, crawler ingestion, Safari/iOS, real screen readers and moderated user tasks. Own server stopped. Codex sole writer; next stable exact-commit Claude read-only review (max3), then R6. No production release yet.

Correction to preceding sealed capture count:54 route screenshots plus1 tile screenshot (55 total), not55 route screenshots. R6 preparation reproduced duplicate Location on a cold mixed-case species request (MISS, two identical headers), saved in r6-species-redirect-before.json/process.json. A prior probe followed redirects until Node's20-hop limit and a subsequent warm request returned one header; only the final clean-build raw MISS establishes the cold defect. Preserve species ISR by handling canonical case before its render; this is the next separate bounded R6 change, not a claim that the framework was fixed.

R7 baseline preparation: existing read-only report completed exit0 for6-13 September UTC.3841 grouped events equal independent count3841;313 page_view and389 homepage_view events are different instruments and are not summed;222 affiliate_click events are not purchases or unique customers. All existing decision questions report LOW SAMPLE or MISSING COVERAGE. Saved r7-pre-release-posthog.json/process.json; no event ingestion/dashboard change. No EPN revenue attribution or post-release improvement established. Original research and19 September GSC note retained; Stage B OWNER_SUSPENDED/outreach parked.

R5 independent round1 at301bc7a: Claude PASS, exit0/is_error=false/permission_denials empty. Source/evidence review identified two conflicting dark-mode classes in PokemonFilterList; Codex accepts/removes the redundant dark:text-zinc-600. Stylesheet ordering is deterministic, contrary to the review's wording, but competing declarations are unnecessary. Review did not actually open the requested PNGs (stream tool-use verified), so visual independent review is still pending, not silently counted. Next: narrow colour correction plus explicit screenshot review round2. OtherR6 work is separate and does not change R5 product contracts.

### R6 cross-family release checks (2026-09-13)

Codex sole writer; R3/R4 closed, R5 source reviewed with screenshot round2 pending. R6 handles mixed-case species redirects before ISR using the installed Next proxy convention, preserving the normal page's hour cache and all provider caches. The proxy matches one species segment, uses no data or credentials and drops query parameters exactly like the existing page redirect. It introduces a proxy invocation on species requests; no production cost equivalence is claimed. Installed test helper exports the older unstable_doesMiddlewareMatch name despite the local proxy documentation. Cold raw/follow/cache checks pass10/10, exit0, in r6-redirects.json/process.json.

Homepage, Best Finds and delegated deal categories now have native Skip/main focus without changing existing homepage section IDs. Best Finds type controls are44px; category spacing matches the system and comparison copy allows missing references. Shared small neutral text now has sufficient contrast on warm paper/dark surfaces, reading links have persistent underlines, footer trust links are44px, compact card set links meet24px minimum. Surface/border colours and print black-text rules are retained; checklist heading/group-count contrast is corrected explicitly. Existing axe-core was used without installing dependencies. Initial96/108 accessibility run failed;107/108 after shared fixes exposed remaining table styles, then108/108 passed. Reduced-motion assertions and the delegated vintage category are being included in the final run; do not count preliminary runs as final evidence for later edits.

The existing isolated actual Next generator now includes actual homepage/Best Finds/price-checker and proxy, with the R3 navigation index at /fixture-index. Homepage fixtures use four labelled simulated offers. R5's blanket sets=>empty test helper caused the vintage contract failure (298/299 detail checks); corrected to retain the Jungle control while keeping modern release fixtures sparse, without changing production data filters. Latest prior remaining-family run226/226 passes.86 focused offline regressions pass; final refreshed browser/print evidence pending. No real detail/search/provider requests or alert sends occurred.

Release permission limitation: automatic approval review REJECTED a proposed full-app copy/build with real Supabase read credentials, stating that live private catalogue access conflicted with the offline/provider-isolated/no-real-fetch restrictions. The rejected command did not execute. No retry, indirect build or deployment bypass was attempted. A safer full-app copy using placeholder credentials and the existing deny-external network guard was authorised; it failed exit1 when Next tried downloading Geist/Geist Mono. This is not a successful full app build or a production code failure. Evidence r6-fullapp-offline-manifest.json/process.json/build.txt. Do not send this build to Vercel as a way around the live-data denial. Complete unaffected offline work/review, then obtain explicit permission for the bounded live read-only build/release dependency; no Full Access request.

Read-only existing Vercel auth/project inspection succeeded before the denial; saved r6-current-production.json identifies READY production dpl_5csTmZEq1uk5Wy4f5QGwWg9t85Fp with pokemondealfinder.com alias. No new deployment/push/merge occurred. Fresh origin/ancestry/exact release SHA and full hosted build verification remain required before release. Main working files untouched. Stage B OWNER_SUSPENDED, outreach parked, original research and19 September GSC note preserved. R7 has only the saved pre-release baseline; later conversion/revenue/SEO effects cannot be completed or claimed today without a post-release observation window. Safari/iOS, real screen-reader, crawler ingestion, production provider accuracy/cost and field Core Web Vitals remain unverified; local browser timings are not field measurements.

R6 local review round1: Claude PASS atdeb39b05d8e6b0f633afaeb03ecb4b7e8257c06a; process exit0/is_error=false/permission_denials empty. All10 requested PNGs were actually Read; R5 visual round2 PASS closes the missing independent screenshot gate. Codex accepts both bounded verdicts. Correct two reviewer overstatements: species Skip/main was already present from R4, not newly introduced by R6; sampled rowgroup/contrast inspection does not prove every incomplete axe node harmless. Its line numbers are sometimes inaccurate; source/diff remains authoritative. Evidence r6-review-current.md/stream.jsonl/process.json. Only Read/Glob/Grep were used; no reviewer edits or unrelated-session actions.

Final deb39b0 evidence:150/150 R6 browser checks (including reduced motion, seven routes/four widths),226/226 remaining-family,299/299 card/sealed detail and93/93 catalogue/print checks; all real process exits0.86 offline regressions/lint/build pass. Fourteen axe audits have zero confirmed violations but425 incomplete nodes (405 contrast/20 table association); retain their saved classifications and manual-verification limits. Exact13-page missing-only PDFs contain63/112/152 expected rows, no blank pages or embedded artwork; pypdf exit0. Windows renderer succeeded; Codex inspected13-page contact sheet and full Jungle page. Attempted Python montage failed because Pillow is not installed; used existing System.Drawing instead, no new dependency. Latest source changes below require their own final evidence. Own fixture server stopped. Fresh origin/main=8b16321395153f49bc303ffc2b10e8495a61ba9a; same merge-base,0 incoming/90 local commits atdeb39b0; working tree then clean. Refresh again after any authorised release resume.

R6 bounded category follow-up from direct contract inspection: fetchDealsPage admits displayable plain listings when not discount-sorted, so the category metadata/intros cannot promise every result is below market. Seven category descriptions now describe tracked listings and conditional references, retaining route identities, headings, relevant search terms, chronology and redirects. Dollar-band pages explicitly say US dollars. The actual paginated category query used native total_price for dollar limits/price sorting, unlike the existing USD filter convention. Changed this one query to total_price_usd for limits and price sorting; missing conversion cannot satisfy a dollar bound. No new query/provider call, cache lifetime/key, eligibility change, scanner or DB write. Other shared SORTS consumers remain unchanged.38 offline tests pass, including the actual extracted query with an in-memory recording database: opposite native/USD ordering, missing USD exclusion, min/max and ordinary no-reference admission. Final category fixture/browser/build and read-only review round2 pending; release remains blocked by the explicit live-data build denial above.

Category follow-up verification also covers unknown USD totals sorting last in both directions and an empty set scope returning zero rows without any database query (the old conditional skipped an empty IN list and could expose unrelated deals).40 offline tests pass. Existing currency_migration.sql already declares total_price_usd on both deals tables; no migration or live schema query executed. Initial expanded browser run168/172 failed only the four empty price-band checks: the old test API stub always returned a card after regional hydration, ignoring category presets. Replaced that generated stub with the actual app/api/deals-page route behind the same provider alias/network guard; added the missing test-only fetchCardDealsPage export. This strengthens client/API/preset coverage without editing the production API or accepting the failed run. Final refreshed build/browser and R6 round2 review pending. Release denial remains in force.

Actual-API category run171/172 confirmed the empty USD-band contract, then exposed three existing dark-mode escape links at4.46:1 on zinc-950. Changed only those EmptyStateEscapes text classes from dark:red-500 to dark:red-400; destinations/analytics/controls unchanged. This last confirmed contrast failure is not counted as passed until the rebuilt run completes. No R6 round2 review has launched yet, so all category follow-ups remain one stable review package.

### R6 category review and additional handover closeout (2026-09-13)

Final category package at `a47d5edc24bc28fe217f48fd3cdb15e339525bb8`: provider-isolated build exit0, 40/40 offline tests, 172/172 release browser checks, 10/10 redirects and 299/299 detail checks; every final process exit0. Saved exact release record: `../r3-review-input/r6-category-record-a47d5ed.json`; logs/process records use `r6-category-{build,tests,browser,redirects,details-browser}`. Codex inspected the refreshed narrow vintage and dark empty-price-band screenshots. These replace the failed 168/172 and 171/172 runs above. Default lint on DealFilterChips still reports three pre-existing native-anchor rule failures, reproduced against the unchanged baseline; checking its remaining rules passes with that one rule disabled on the command line only. No lint configuration or production navigation was changed, and a whole-project/default lint pass is not claimed.

Claude independent R6 round2 PASS on that exact SHA and aggregate category diff from deb39b0; real process exit0, terminal is_error=false, permission_denials empty. It read both requested PNGs and the source/evidence; it did not rerun tests. Codex accepts the bounded verdict, with no unresolved actionable finding or disagreement. Evidence: `r6-category-review-{request.txt,diff.patch,stream.jsonl,process.json,current.md}` in the existing sibling review folder (the readable verdict is `r6-category-review-current.md`). Source is unchanged since this reviewed SHA; this closeout only updates durable records. Own fixture server and review process completed/stopped. Full runtime, production provider accuracy/cost, Safari/iOS, real screen readers, crawler ingestion, customer comprehension and field performance remain outside the demonstrated fixture evidence. Release/live-read permission blocker remains unresolved.

Additional handover reconciliation: all 56 PDF pages were read, including both full operating/social instruction packs and D01–D39. The sibling extracted text and seven page chunks are retained under `../r3-review-input/master-handover*`. The supplied Markdown is archived unchanged in docs; source/archive SHA256 both `24F7014DD1A6F620BFB58CA2883058A279CE59FA09FBFDF5FF6FD485A16D982B`. Its old R2 checkpoint, R3-not-started instruction and September 11 backlog are dated history, superseded by the actual implementation/review entries above. The current practical Codex-writer/Claude-read-only split remains in force; no coordinator, runner, agent or permission-expanding AGENTS rewrite was introduced.

Targeted continuity checks recovered existing origin/main history for 17C.1–.10 (guide links, checklist pilots/expansion, species usefulness, dated sets, Mega Evolution identities, Latest Releases, sealed discrimination and comparison provenance), alongside the recorded 17C.11/.12. Commit subjects establish existing implementation history, not a fresh test/deployment certification of every subphase; 17C.0's exact closeout remains unspecified. The historical async_hooks client-bundle lead is not treated as a newly reproduced defect: current SearchClient and DealCard import browser helpers from lib/ebayLinks; server telemetry still legitimately uses AsyncLocalStorage. No full-app build success is inferred. Held commits 1fd6769 and b2f2e7f remain outside this branch's ancestry and their worktrees are preserved. Magneton/Glaceon historical leads are not reclassified as freshly verified live-provider outcomes.

The separate social recovery brief is retained, including Instagram, X, YouTube and TikTok continuity and local creative preparation. Existing social worktree/session ownership was observed, so no competing social writer or activation was started. Stage B stays OWNER_SUSPENDED; outreach, paid calls, DB mutations, scanner/cron/email activation and external publishing remain held. Deferred SEO/research/operational items in the master document remain the existing backlog, with their recorded dependencies; they are not all new release blockers or silently marked complete. Original research and the 19 September GSC note remain intact. Next gate: explicit bounded permission for live read-only catalogue access and font downloads needed by the full build, followed by fresh release ancestry/build/hosted verification. R7 outcomes require a later observation window. Main working files remain untouched; nothing has gone live from this overhaul.

### Full application build after explicit read permission (2026-09-13)

James answered yes to the specific request for live Supabase catalogue reads and font downloads for the full build, with no database writes or paid providers. Automatic review allowed the new bounded command; this is an authorised change of scope, not a retry bypass of the earlier denial. Existing local public URL/anon configuration was sufficient; no credentials were printed, changed, copied into source, or requested in chat. Separate `.next/r6-fullapp-readonly` copy uses actual tracked source at `6e8d5fa`, no provider aliases, only the two public Supabase variables and operating-system essentials. Its preload guard allows REST GET/HEAD and Google fonts, denies RPC/auth/write requests and all other external hosts; service-role/provider keys and env files are excluded.

Installed Next16.3.3 full webpack build completed exit0: compiled, type check finished, all37 static outputs generated and build traces completed. No guard denial or application build error appears in the saved log. The nested copy emits the expected multiple-lockfile/root-inference warning, not a failure; no production configuration change was made to suppress it. Evidence in existing sibling folder: `r6-build-fullapp-readonly.cjs`, `r6-live-read-guard.cjs`, `r6-fullapp-readonly-{manifest.json,process.json,build.txt}`. This verifies the full build with its declared public-credential subset; it does not prove full production runtime, private admin configuration, paid-provider calls, live detail/search behavior or future field outcomes. No handlers/jobs were invoked. Fresh origin/main remains `8b16321395153f49bc303ffc2b10e8495a61ba9a`, 0 incoming/94 local commits before this ledger update. Production cron and GitHub workflow files have no diff from that base. Next: bounded read-only release-evidence review, then authorised release and hosted checks; no activation of suspended systems or unrelated main working-file edits.

Final R6 round3 read-only Claude review PASS at ledger SHA `97edd79c8eb36cfed06a2e5c86ace5b68565f371`; process exit0, is_error=false, permission_denials empty, subscription apiKeySource=none. Exact build/source/scope evidence inspected; no release-blocking inconsistency. Codex accepts the verdict. Reviewer correctly retains a limitation: NODE_OPTIONS is supplied for worker inheritance, but no separate per-worker guard activation trace was captured; do not claim direct per-worker observation. No source correction or new screenshot claim. Evidence `../r3-review-input/r6-release-review-{request.txt,stream.jsonl,process.json,current.md}`. Three R6 review rounds completed; no unresolved disagreement. Proceed with the owner's authorised release of this reviewed application plus documentation closeouts, preserving the current deployment ID `dpl_5csTmZEq1uk5Wy4f5QGwWg9t85Fp` as the recorded pre-release version. Hosted verification still pending; R7 remains observation-only, suspended growth systems unchanged.

Production push blocker: immediately before the proposed release, origin/main remained 8b16321 with zero incoming/96 local commits, clean HEAD `3e918674f4e8386795dd79c8b3ccb0fa265bdeaf`. Automatic approval review rejected `git -c gc.auto=0 push origin HEAD:main` before execution, stating: "Pushing directly to origin/main is a consequential production/release mutation, while the trusted instructions explicitly prohibit production push/merge/deploy and do not provide a clear later approval of this exact fast-forward push." Although Codex interpreted the owner's earlier go-live instruction as release authority, this actual rejection controls execution. No retry, alternate branch/PR, direct Vercel deployment or other indirect bypass was attempted. Obtain explicit permission for the normal fast-forward production push of the reviewed branch (including this documentation-only blocker record), which may trigger Vercel production deployment; then recheck ancestry and hosted readiness. The supplied Supabase read permission remains valid and its successful build is not reopened. Hosted smoke script is prepared in the existing sibling evidence folder but has NOT run; no production verification pass is claimed. Main working files and unrelated sessions remain untouched.

### Approved production release and hosted closeout (2026-09-13)

James explicitly answered "approved" to pushing deal-first-r0r2 to origin/main and allowing its Vercel production deployment. Automatic review then allowed the exact normal fast-forward push. Fresh check: clean release HEAD c3501391f31bfa422b9726808ec0cca78d1fffe5; origin/main 8b16321; zero incoming/97 local commits. Push exit0 advanced remote main to c350139. No forced update, local main checkout or change to main working files. No cron/social/environment setting change or manual job activation.

Vercel's Git integration built that exact SHA on main: deployment metadata records githubCommitSha=c3501391f31bfa422b9726808ec0cca78d1fffe5, target production, URL pokemon-deals-lhw7zoa84-clarkin-collective.vercel.app. Hosted build completed successfully (28s reported by Vercel), then deployment `dpl_8Ds8aqKLgF15TcpVTBFrqvZiB6TC` reached READY and acquired pokemondealfinder.com and the existing aliases. The previous deployment remains recorded above; no rollback occurred. Saved deployment/status/build evidence: `../r3-review-input/r6-release-deployments.json`, `r6-release-inspect.json` (earlier BUILDING snapshot), `r6-release-build-log-stderr.txt` (CLI writes build logs to stderr), and final `r6-live-alias.json`.

Hosted smoke exit0: homepage, Guides, Sets, Pokemon directory, dated reference-price study and Privacy all return200 with exactly one H1/main and the expected canonical URL. Four screenshots at1440/390 show no horizontal overflow; Codex inspected desktop/mobile homepage and mobile Sets/Guides pixels. Homepage contains13 eBay links and visible direct actions; none clicked. Evidence `../shots/r6-hosted/record.json` and PNGs, `../r3-review-input/r6-hosted-smoke.mjs`, `.txt`, `-stderr.txt`, `-process.json`. Browser script execution was disabled for this narrowly scoped hosted check, preventing analytics/prefetch/provider/API/submission calls: these are initial SSR pixels, not new hosted hydration/interaction proof. Prior provider-isolated interaction/storage/print/redirect/accessibility evidence retains its stated scope. Own screenshot Chrome closed; no detail/search or job endpoints requested.

Release task complete within the authorised overhaul scope. R7 post-release SEO/conversion/revenue/customer evidence needs a later observation window; no improvement claim is made today. Safari/iOS, real screen-reader use, full live provider correctness/cost and field Core Web Vitals remain unverified, not silently passed. Keep the 19 September GSC note, original research, held unrelated commits and deferred portfolio backlog. Stage B OWNER_SUSPENDED and outreach parked. This local documentation closeout is intentionally subsequent to deployed c350139; it does not imply another production deployment.

Hosted SEO continuation: five additional checks pass, exit0. robots.txt200 permits the site and disallows /api/, with the correct sitemap URL; sitemap.xml200 contains exactly the nine expected child sitemap URLs; /dev/deal-states404; both /pokemon/Dragonite and /pokemon/DRAGONITE?release-check=1 return308 with exactly one raw Location header resolving to /pokemon/dragonite, with the query removed. Redirects were not followed and no detail/search/provider/job or child sitemap endpoint was requested. Initial verifier exit1 incorrectly required an absolute Location; Vercel's relative Location is valid. Preserved initial evidence, fixed only the verifier to resolve against the origin, and repeated the checks successfully. No production source change. Artifacts `../r3-review-input/r6-hosted-seo.mjs`, `r6-hosted-seo.json`, `.txt`, `-stderr.txt`, `-process.json`, and `-initial.json`/`-initial-process.json`.

R7 next observation remains the existing 19 September GSC note, not an activated schedule or a new roadmap. Release occurred on13 September;14 September is the first full UTC day after release. Any later comparison must use equal, completed windows and matching dimensions/instruments, explicitly separating pre/post-release data and geography where available. The saved6–13 September baseline alone is not a comparable post-release window; page_view and homepage_view must not be summed as one instrument, and affiliate_click is not a purchase or unique customer. Report sample sufficiency and missing coverage before making conversion, revenue or indexing claims. No analytics ingestion, dashboard mutation, external message or new automation was performed in this closeout. The overhaul is live; future measurement, existing deferred work and explicit suspended tracks are not marked finished merely to close the release.

### R4/R6 owner feedback: set-page commercial hierarchy (2026-09-13, local only)

James reports: "when i look at sets and checklist and click into a set its burried with set text it should showcase the deals. not optomised. im worried accross the website this might be the case". Treat the report and wider concern as owner experience, not independently verified whole-site evidence. The current Master Handover/PDF acceptance now explicitly includes early useful identity, relevant eligible offers when available and clear checklist access. No new coordinator, competing roadmap, broad rebuild or deployment authorised. Codex sole writer; Claude bounded read-only reviewer; existing holds preserved.

Confirmed on the actual set template using the existing provider-isolated Next fixture: the full checklist precedes the offer grid. With the unchanged Jungle64 fixture, first offer begins at6876px on1280 desktop and6245px on390 mobile; its action is7372.5/6495px down. Supporting checklist explanation also consumes first-screen space. This independently confirms a set-template hierarchy problem; it does not prove current live inventory or the same problem on every family. Before source SHA6dc20b7; screenshots/HTML/positions saved under `../shots/set-hierarchy/before`. Neo Destiny113 provides the no-offer control;320dark is included for both.

Bounded correction: the existing eligible initial deal grid precedes inventory only when it contains offers. No-offer catalogue pages still lead with their card list/checklist. Compact identity header retains the H1, makes Open checklist/Browse card list explicit, and uses a real in-page anchor with focusable inventory target. Supporting introduction and full set fact strip move to a lower About section; existing price summary, numbering/provenance notes, species list, valuable cards and sealed sections remain crawlable. No metadata/URLs, provider calls, eligibility, sorting, cache rules, link population or checklist persistence/print code changed. Set-only compactFilters reuses the existing FilterBar/FilterToggle collapse option; other DealGrid consumers retain their default layout. Active filter chips/requests remain outside the collapsed controls.

Final evidence: isolated build exit0;51 existing checklist/reference/progress regressions and38 storage/filter regressions pass; changed-file lint/diffcheck pass. New focused browser verifier passes48/48: both templates at1280light/390light/320dark; unchanged initial card destination sets and title/description/canonical; early checklist shortcut, real anchor scrolling, filter expansion/collapse, no invented offer on the empty control, no overflow or captured runtime exceptions/unexpected external requests. Jungle first offer now390px desktop/470px mobile; action886.5/720px, within the tested900px viewport. Initial after run31/34 exposed desktop action just below the viewport and a verifier that sampled smooth anchor scrolling too early; spacing tightened and verifier waits for scrolling and visible-image completion. No failed run reclassified as passed. New verifier `scripts/verifySetHierarchy.mjs`; logs/process JSON `set-hierarchy-*` in the existing sibling review folder; after screenshots/HTML/record in `../shots/set-hierarchy/after`. Codex inspected desktop/mobile/dark offer pixels and no-offer checklist.

Existing93/93 catalogue browser checks pass, including all initial links, list/gallery, owned/missing persistence, reset/focus, storage-failure copy and printable hidden list. PDF extraction confirms63/112/152 missing rows across3/4/6 nonempty pages, exact collector-number sets and missing-only scope; no embedded artwork. Existing Windows renderer produces Jungle's3 pages; Codex inspected the first page, with no offer/header content intruding. This is not an all-page visual recertification; previous13-page inspection remains historical evidence. Own fixture server/Chrome stopped. No live provider fetch, DB mutation, external publishing or deployment. Stable-commit independent review pending, maximum3 rounds for this new bounded feedback correction.

Family-specific acceptance for subsequent existing-phase work: deal discovery/category/listing surfaces expose honest eligible offers and their exact action early; set/species pages pair compact identity with offers when present and a direct full-inventory/checklist path; no-offer catalogues lead with useful reference/checklist access; permanent card pages retain crawlable exact-card answer/identity/provenance near the top while making live offers easy to reach; guides/research prioritise the answer, contents and evidence rather than forced commerce. Check representative populated/empty desktop/mobile states as each family is touched. The owner's wider concern remains a follow-up criterion, not a claim that all families fail or a reason to remove factual SEO content, invent offers, loosen eligibility or start an unrelated whole-site audit.

Independent feedback-correction round1: Claude PASS at `a6405290b67333f729e27d775ce091ff39131706`; real process exit0, terminal is_error=false, permission_denials empty. Seven PNG Reads confirmed in streaming log (six requested before/after/control screenshots plus print sample). Source, diff and saved evidence reviewed; no tests independently rerun. Codex accepts the scoped result with no actionable correction. Clarify review wording: "all claims independently reproduced" means source/evidence inspected, not fresh execution; preserved sampled metadata/links does not certify all SEO outcomes; tabIndex=-1 on #inventory is newly added, not retained; a deal-backed set with an empty initial result still retains its lower grid/empty state, whereas catalogue-only sets have no deal section. Screenshot inspection is not a full contrast/accessibility certification. Evidence `../r3-review-input/set-hierarchy-review-{request.txt,diff.patch,stream.jsonl,process.json,current.md}`. No reviewer edits, new coordinator or denied-edit retry.

Reviewable artifact: `../shots/set-hierarchy/index.html` pairs original-size desktop/mobile/dark before/after captures and the no-offer control, states simulated-data limits and links every PNG. The local correction is complete within this bounded owner-feedback task. No push/deployment; current production remains c350139. Broader family hierarchy concern stays an acceptance criterion for subsequent scoped work, not a completed whole-site audit. Main working files, held commits, Stage B suspension, parked outreach and the R7/19 September observation gate remain unchanged.

### R4/R6 continuation: species hierarchy and regional anchor interaction (local only)

Following James's "continue", inspected the next related family without changing the no-deployment instruction. Existing Dragonite fixture had no offers and could not establish populated-page hierarchy. Reused its existing explicitly simulated Light Dragonite/non_usd offer in the provider boundary, with a consistent one-card fixture count; real catalogue identities remain historical and eligibility is not proved by this fixture. Unchanged species source at e70bb44 places its full75-card list before the deal grid: before first-offer top6448.5px desktop1280,9462.5px mobile390,10301.5px320dark. Saved before screenshots/HTML/records under `../shots/species-hierarchy/before`. No-offer Cleffa is already catalogue-first (inventory452.25px mobile), so its SpeciesCatalog template remains untouched.

Deal-backed species correction follows the set-page pattern: existing nonempty verified-only offer grid first, compact identity/shortcuts, full card-list anchor with focus target, existing compact filter option. When the initial grid is empty, inventory still precedes the existing empty/error section. Long introduction, dex/evolution facts and separate catalogue/deal-card counts move to lower context; directional words updated to match placement. Ranking, membership, queries, provider/cache contracts, metadata/JSON-LD, all card destinations, valuable-card references and provenance remain unchanged. Permanent CardWorthAnswer and no-offer SpeciesCatalog are untouched. First offer now374px desktop/446px mobile/494px320dark; CTA870.5/728/776px within the tested900px viewport. These are fixture measurements, not production inventory or universal viewport claims.

The set regression exposed an intermittent real interaction after moving grids above inventories. A controlled delayed /api/rates response reproduced lost #inventory and a loading-skeleton shift:50/54 checks passed initially, with recorded target top933.5px/scroll0/hash empty on desktop and mobile targets thousands of pixels offscreen. Earlier set-only PASS did not establish this delayed hydration case. RegionRedirect now retains the current fragment and dispatches its existing pdf:region event after the router's country query commits, rather than before it. The pre-commit event could miss the first filtered request; a held-response test demonstrated the gap. On compact offer-first grids only, DealGrid remembers an explicitly selected, focused inventory anchor while loading and realigns it on completion; wheel/touchmove/keydown cancels it, and changed focus/hash prevents it. No alignment for ordinary browsing or other grids. This is a bounded correction to the newly important shortcut, not a new navigation system or region/filter policy.

The established hierarchy verifier now supports set/species families and controlled delayed-region/wheel modes. Controls require actually held requests; each race case clears only its disposable Chrome profile's storage and disables browser cache. An early cancellation run failed because no desktop offer response was held; after region-event correction, subsequent mobile failures revealed cached region priming before the intentionally delayed response. These failed runs are archived, not counted as passes. Final delayed-region60/60 and real-wheel cancellation66/66 checks pass, both exit0; the latter proves an actual pending request and wheel movement before asserting the visitor is not forced back. Ordinary species42/42, set48/48 and catalogue93/93 browser checks pass, all exit0. Source regression98/98, changed-file lint and isolated actual Next build exit0. Final PDF extraction again confirms63/112/152 missing rows in3/4/6 nonempty pages; no new print-layout change or fresh all-page visual certification claimed.

Evidence: existing sibling `species-hierarchy-*` build/browser/regression/lint/process logs; `hierarchy-anchor-race-before*`, `hierarchy-anchor-race-after*`, `hierarchy-anchor-scroll*` including archived failed records. Screenshots/records in `../shots/species-hierarchy/{before,after}` and `../shots/set-hierarchy/after-rates-race` / `after-scroll-during-load`. Codex inspected final desktop/mobile/dark species pixels and the unchanged no-offer control. Normal before/after HTML preserves75/4 unique card destinations and title/description/canonical. Own fixture server stopped after final checks. No live detail/search/provider call, DB write, push/deploy, scanner/cron/email/social activation or unrelated main-file edit. Stable-commit read-only review pending, max3 rounds for this bounded continuation; existing set correction remains local. Safari/iOS, physical touch/keyboard assistive use and production runtime are not established by these Chrome fixtures.

Independent species/anchor review round1: Claude PASS at `b15d7923f305c76b55e35e5ced9c9abb01e2bfa6`; real process exit0, terminal is_error=false, permission_denials empty. Seven requested PNG Reads confirmed in streaming output. Read-only source/diff/saved-evidence review; no independent execution or reviewer edits. Codex accepts the bounded verdict after checking the shared navigation effects and review evidence. Clarifications: this includes a shared navigation correction, not strictly placement-only changes; the owner's original concrete complaint concerned sets/checklists, with species selected as the related follow-up. The controlled delayed-region and wheel-cancellation runs exercise set routes only. Species normal navigation and screenshots pass, but species-specific controlled races remain unverified; shared components provide indirect coverage, not proof of route parity. No extra test round is required for this non-blocking limitation. Evidence `../r3-review-input/species-hierarchy-review-{request.txt,diff.patch,stream.jsonl,process.json,current.md}`.

Reviewable species gallery: `../shots/species-hierarchy/index.html`, with desktop/mobile/dark before/after and unchanged no-offer control. This bounded continuation is complete locally. Current production remains release c350139; neither set nor species corrections have been pushed or deployed. The next release gate is explicit owner authorization for these local corrections, followed by appropriate release verification; existing R7 observation and 19 September GSC note remain outstanding. Further family work follows the existing page-intent criteria rather than starting a new whole-site audit. Codex remains sole implementation writer; Stage B OWNER_SUSPENDED, outreach parked, main working files and held work untouched.

### R4-R6 owner-requested browsing journey continuation (local, 2026-09-13)

James requested continued work without repeated continuation prompts, then explicitly asked for every page setup in Sets/Checklists, Browse by Pokemon and their destinations to be assessed for a premium buying experience. Treat that as page-template coverage, not permission to visit every paid-provider-backed URL, rebuild the whole platform or deploy. Earlier set/species detail corrections remain intact. Current source and saved representative desktop/mobile captures confirm additional friction: the Pokemon directory exposes a long generation list without a deals-only choice; the card directory buries browsing choices behind explanatory copy; set rows leave counts/actions terse; Latest Releases puts long identification material before useful release navigation/listings; sealed artwork pushes price/action below the first screen. Card/listing sample captures retain their exact-card answer or direct action, so those templates were not rewritten speculatively.

Implemented within the same phase ledger: Pokemon directory adds a reversible With deals mode over its existing qualifying hub data, combinable with name filtering; default All Pokemon preserves all1025 SSR links and generation behavior. Set rows explain deal counts and checklist destinations. The card directory shortens its intro and puts existing set/species destinations early, relocating full catalogue counts/limitations lower. Corrected the old set-order description to match the existing deal-count-first sort. Latest Releases moves full set/box disambiguation below listing groups while retaining a short featured-release warning/link; populated listings precede the lineup, while the no-offer control keeps release navigation first. No selection/ranking or release-date rules changed. Sealed offer artwork uses bounded height with object-contain at mobile/desktop; complete image remains visible, price and eBay action now fit the tested900px viewport. Full catalogue/checklist data, storage/print handlers, metadata/schema, affiliate handlers, cache/provider contracts and eligibility are preserved.

Final isolated actual Next build exit0 (`browse-journey-final2-build*`), final family browser238/238 exit0 (`browse-journey-final3-browser*`), existing catalogue93/93 exit0 (`browse-journey-catalogue*`), offline release/sealed regressions27/27 exit0, changed-file lint exit0 and diffcheck pass. Twenty saved-HTML checks preserve every prior catalogue/shopping destination plus exact title/description/canonical on the five touched route families (`browse-journey-link-parity*`). All1025 species links remain initial HTML; no live catalogue-count or crawler-ingestion claim. Codex inspected final mobile directory/release/sealed, desktop card-directory and narrow dark set/sealed/deals-mode pixels. Gallery `../shots/browse-journey/index.html` links fifteen before/after pairs plus deals-mode, and prior set/species galleries. Directory before captures are retained prior R5 evidence (source unchanged before this correction); sealed/release before captures were refreshed during this run. Latest Releases remains a sparse browser fixture: populated ordering has source/model coverage, not a newly observed populated browser state.

Failure accounting: sandboxed Chrome debugging endpoint failed once before a page opened; authorized escalation succeeded. A duplicate fixture-start attempt reported EADDRINUSE while the owned prior server still ran; no unrelated process was killed. Initial isolated build/test worker spawn EPERM failed before tests ran; the retry used the existing approved isolated scope. The network-oriented SEO suite was omitted from retry and not claimed as tested. Initial expanded family run231/232 failed the Japanese sparse control because its fixture returned early before maxPrice filtering; corrected only the fixture. Subsequent run exposed oversized desktop sealed art and a verifier accidentally returning a DOM node through CDP (object-reference-chain error); capped artwork at both sizes and returned a boolean, then final238/238 passed. Thresholds were not relaxed. Module-type warnings remain classified; final runtime errors/unexpected external requests zero, local404/prefetch cancellations retain the verifier's explicit classification.

The preceding species review's indirect-race limitation is now narrowed: species delayed-region54/54 and actual-wheel cancellation60/60 pass, real exits0 (`species-anchor-race*`, `species-anchor-scroll-retry*`). The verifier releases the catalogue-only control's held region response before the next case; it does not invent an inventory jump for that template. These are Chrome fixture results, not Safari/iOS or physical assistive-use proof. Original failed Chrome-start log is retained. Own fixture server stopped after checks. Stable-commit Claude read-only review pending, maximum3 rounds. Codex sole writer; no paid calls, production requests, DB writes, outreach, activation, main working-file edit, push or deployment.

### Both-PDF acceptance reconciliation: current disposition

This table updates the old PDF coverage index inside this ledger; it is not a competing roadmap. The Master Handover predates today's implementation. Its opportunity register explicitly requires evidence/dependencies rather than simultaneous activation of all D01-D39 ideas.

| Requirement group | Current disposition / remaining trigger |
| --- | --- |
| Deal-first R0-R2 foundation/home, R3 exact-card/listing, R4 catalogue/checklist, R5 remaining families | Original reviewed implementation deployed at c350139. Subsequent set/species corrections reviewed locally; current directory/release/sealed continuation awaits its bounded independent review. |
| R6 visual/responsive, schema/links, handlers, storage/print, runtime | Recorded provider-isolated matrices and earlier bounded hosted/full-build checks establish their stated boundaries. Current touched-family results above. Safari/iOS, physical screen-reader use, full live-provider accuracy and field Core Web Vitals remain unverified and require the actual environments/data. No source scan or screenshot is substituted for them. |
| R7 comprehension, return tasks, earnings and SEO effects | Existing measurement document now has a ready neutral six-task protocol; study not conducted, recruitment/outreach not activated. Saved baseline is 6 September00:00 through13 September00:00 UTC exclusive (days6-12), not the partial release day. First full post-release UTC day14 September; comparable windows/EPN access/participants and19 September GSC observation are future triggers. No revenue/uplift claims. |
| Master continuity / operating charter | Full56-page read and unchanged archive retained; practical sole Codex writer/Claude read-only review operational. 17C.1-.12 history recovered as documented; exact17C.0 closeout unspecified. Held1fd6769/b2f2e7f preserved, not silently merged. No new coordinator, scheduler or permission expansion. |
| Social recovery A/B/C, Instagram/X/YouTube/TikTok, local creatives/canaries | Separate observed social worktree/session retains ownership. This coordinator does not create a competing writer. Stage B OWNER_SUSPENDED; separate owner's reconciliation/approved scope is the restart trigger. No posting, hosting, paid generation or schedule activation. |
| Existing deferred product/SEO opportunities | Dollar100+, grading consolidation/calculator, printing/history/graded ladders, affordable/AU modules, editorial attribution, generation structure, research imagery/movers and Japanese permanent catalogue remain conditional portfolio work. Restart with documented demand/data/identity coverage and a bounded accepted brief; not inferred release defects. Existing implementations must be deduplicated first. |
| Operational/provider/growth backlog | SQL/index/retention/thinning/backup follow-ups, contact monitoring/CI secrets, child-sitemap submissions, provider rights/quota requests, FR/ES/NL, digest, recurring Stage A/B reconciliation/analytics and outreach/community remain under their existing access/rights/quota/activation holds. No credentials, mutation, spending or external contact authority is inferred from the PDFs. Preserve existing runbooks/phase evidence; James's manual Supabase option remains available only for a concrete required change, none is newly required by this UI task. |
| Release gate for local feedback corrections | Not deployed. The explicit no-deployment instruction remains in force; a later exact reviewed release scope and authorization are needed. Original live release and future observations remain distinct from these local corrections. |

Browsing review round1: Claude PASS at58008915206a247498674503e7981c115df45a34 after the normal escalation was approved. Initial sandboxed review ended exit1/is_error=true with ConnectionRefused and a session-env mkdir EPERM; zero model usage, no verdict, and no approval denial. It was not counted as review. Approved retry ended exit0/is_error=false/permission_denials empty; eight requested PNG Reads confirmed. Evidence `browse-journey-review-retry-{stream.jsonl,process.json,stderr.txt}` and `browse-journey-review-current.md`; failed initial logs remain. Codex accepts the scoped findings: add role=group to the named Pokemon toggle wrapper. Correct reviewer overstatements: populated Latest Releases ordering is source reasoning, not asserted by the sparse browser verifier; bounded artwork changed framing, not cropping; the diff includes more than its stated eight files. No independent test execution occurred.

Codex also checked the actual set route's allowlist/identity/truncation gates: a directory count does not establish collection-tracking availability for every set. Narrow follow-up changes the universal checklist promise to card lists/references with collection checklists where available; row labels use cards/card list. The named Pokemon group now has role=group. Browser screenshot capture blurs the already-verified desktop Skip target before capturing normal appearance; focus behavior still tested. Measurement docs explicitly distinguish local follow-up placements from the released baseline. Final follow-up isolated build exit0, family238/238 exit0, changed-file lint exit0, refreshed20/20 destination/metadata parity; evidence `browse-journey-r2-*`. Codex inspected final390light/320dark set wording and1280 card directory. Gallery after captures refreshed. Own fixture server stopped; follow-up stable-commit review round2 pending, no deployment.

Browsing follow-up review round2: Claude PASS at3fd49ebde024f6eacd2adb6ddc56b47518827020, real exit0/is_error=false/permission_denials empty; three requested PNG Reads confirmed. Codex accepts source/visual findings, with no unresolved actionable issue in this slice. Correct the review's ledger description: the final paragraphs concern this browsing correction, not an unrelated homepage/pricing round; also no populated-release browser assertion exists. Evidence `browse-journey-r2-review-{request.txt,diff.patch,stream.jsonl,process.json,current.md}`. This slice is locally complete and not deployed. The refreshed mobile family contact sheets were inspected for overall hierarchy (not a substitute for the individually reviewed PNGs).

Continuing the owner's every-template request: route inventory identifies `/search` as the remaining unrendered customer front door in this offline matrix (`/price-checker` is its existing redirect). Source inspection confirms SearchClient lacks the shared Skip/main focus target. Next bounded R3/R6 task: extend the established provider-isolated fixture boundary to the actual search wrapper/client with deterministic simulated search responses, capture bare/results/reference/empty states before choosing further layout changes, and repair the confirmed keyboard navigation omission. `runCardSearch` and the tcgplayerId API branch can reach pricing providers; neither may run against real data. No live searches, provider calls or new search promises. Existing parser/ranking/URL and hydration contracts are protected; use the same sole-writer/read-only-review split.

### R3/R6 remaining search front door (local, 2026-09-13)

The owner's page-template request continues from46ddb4a. `/search` was absent from the earlier actual-Next family fixture; `/price-checker` redirects to it. Read the actual server wrapper/client/API and provider paths first. Extended the same generator with actual SearchClient, wrapper and API handler, aliased searchEngine to deterministic data, added searchEngine to the forbidden real-module assertion, and made the legacy tcgplayerId pricing helpers throw in fixture data. Browser independently blocks that API branch. Saved compiled server inventory confirms one fixture-data module and zero real searchEngine modules. Existing stripped credentials and network preload guard remain; no real search, DB or paid-provider path ran. The simulated Clefable control uses existing Jungle1/64 artwork/identity; reference/missing query strings are fixture control keys. This is not engine resolution/ranking/eligibility proof.

Before captures and65/65 checks confirm a usable mobile offer state but desktop expanded filters bury the first offer (top748px/action1244.5px at1280). Narrow two-column reference tiles truncate set/collector-number metadata. Source and all before states lack the shared Skip/main target. Saved four states at1280light/390light/320dark under `../shots/search-journey/before`.

Bounded correction in SearchClient only: shared Skip link and one main region encompassing the primary search form and results; shorter readable intro/spacing; existing optional FilterToggle collapsible on desktop as well as mobile, with active chips/notes preserved; full-width phone reference cards with contained art and unclamped name/set/number metadata. Query parsing, URL state, subscriptions/hydration, filter semantics, sorting, engine/API contracts, metadata/schema/robots, catalogue destinations and affiliate wrappers remain unchanged. Full price-checker guide/limitations remain below results. Measurement docs record the desktop filter-exposure change without inventing new events or outcomes.

Final isolated build exit0 (`search-journey-final2-build*`);87/87 actual-browser checks exit0 (`search-journey-final2-browser*`): all four states/three sizes, first offer and eBay action within tested thresholds, query noindex/canonical, initial card links, zero duplicate initial search API requests, actual client submit to isolated API, budget filtering retains reference card, Back restores offers, and keyboard Skip includes the form. Zero captured runtime exceptions or unexpected external requests. Twenty saved-HTML comparisons preserve exact title/description/canonical/robots and every original catalogue/search destination (`search-journey-parity*`).78 offline parser/facet/navigation/hydration regressions pass exit0. Gallery `../shots/search-journey/index.html` includes12 before/after pairs and prior galleries. Codex inspected final desktop/mobile offers, narrow reference identity and empty recovery. Own server stopped after checks.

Failure/limits: initial after84/84 run did not yet require the action to fit the first screen; screenshot inspection found desktop action940.5px. Added the stricter acceptance; next run86/87 failed at900.5px, archived as `search-journey-86-of87-record.json`, then spacing was refined and87/87 passed without changing the threshold. Default changed-file lint fails the same react-hooks/set-state-in-effect error and unused-disable warning reproduced on the unchanged46ddb4a SearchClient baseline; preserving that existing hydration implementation is intentional. Other lint rules pass with only that baseline rule excluded on the command line, exit0 with the pre-existing warning; no config change or clean/default-lint claim. Logs/process records `search-journey-{baseline-lint,lint,final2-lint}*`. No full production runtime, engine/provider accuracy, Safari/iOS, screen-reader user, crawler ingestion or customer-study proof. Stable-commit Claude read-only review pending, max3 rounds for this bounded task. No deployment or activation; prior both-PDF dispositions remain authoritative.

Search review round1 returned PASS with process exit0/is_error=false, but its permission_denials contained two unrelated `mcp__plugin_vercel_vercel__get_purchase_quote` requests (one placeholder team/product, one empty input). Both were denied with the recorded reason that permissions had not been granted. No quote/purchase executed according to those results. This run was not accepted as closure; the reviewer's claim of no permission failures was incorrect. The earlier user-facing description attributed the denial to automatic approval review, but the log establishes only a Claude permission denial, not which approval layer. Artifacts `search-journey-review-*` retained. Neither external request was retried.

Operating correction: installed CLI help establishes that `--tools` restricts built-in tools only. The repeat used documented `--safe-mode --strict-mcp-config --mcp-config` with the saved empty MCP configuration, plus Read/Glob/Grep allowlists. This removes capabilities without bypassing protections or changing global settings/auth. Checked `claude agents --json` before launch and left James's interactive and separate social sessions untouched. Normal existing subscription access was approved through the escalation mechanism. Init event confirms exactly Glob/Grep/Read and no external MCP tools.

Search review round2: Claude PASS at unchanged `0a8f41825622742b4e70628ccee6489681b1d1b8`; process exit0, terminal is_error=false, permission_denials empty, six requested PNG Reads confirmed. Artifacts `search-journey-r2-review-{request.txt,stream.jsonl,stderr.txt,process.json,current.md}`. Codex accepts the scoped review with no unresolved actionable finding. Clarify evidence wording: zero errors means captured runtime exceptions, not a full console/HTTP failure audit; metadata/destination parity is sampled saved HTML; provider isolation does not establish real engine correctness. The reviewer inspected source and saved results, not independently rerun tests.

The expanded customer-template pass is locally complete within its stated representative states: prior home/detail coverage, corrected sets/species and directories, the27 R5 fixture cases, and the new four-state search matrix. The36 page-file inventory includes a development-only page and the price-checker redirect; this is template coverage, not every live catalogue URL or inventory condition. Before/after galleries make the changes reviewable. Codex remains sole implementation writer; no further product code changed during review closeout. No push, merge, deployment, provider call, DB change or activation occurred. R7 future observation/participants, explicit suspended work, deferred opportunities and release authorization retain the dispositions above; neither PDF is falsely marked wholly complete.

### Owner-authorized feedback release and Claude handover (2026-09-13)

James now explicitly requests: "deploy it" and all work pushed before the intended Claude handover. This supersedes the earlier no-deployment gate for these reviewed corrections only. Fresh origin/main c350139 has zero incoming/11 local commits at3b324f5, clean tree. Existing production remains READY dpl_8Ds8aqKLgF15TcpVTBFrqvZiB6TC. Fresh full application build of3b324f5 passes exit0 using the prior authorized read-only Supabase REST/font guard; no provider/service-role keys, RPC/writes or paid calls. Evidence `feedback-fullapp-readonly-{manifest.json,process.json,build.txt}`. No code changes since independent review; later release/handover commits are documentation. `docs/CLAUDE-HANDOVER-2026-09-13.md` indexes actual completed work, local evidence and remaining gates. Normal fast-forward production push and hosted verification follow; do not claim READY until observed.

### Consistency-and-correctness phase 1 (Claude, local, 2026-09-13)

Reconciliation before any code change: production main was at `adc953a` on handover; two commits Codex had deliberately held back as unmerged (`1fd6769` collector-number-search, `b2f2e7f` analytics-runtime-verify — both additive/test-only, `lib/` and `components/` byte-identical to `origin/main`) were reviewed, cherry-picked onto a clean branch off `origin/main`, verified (16/16 tests pass, `node --check` clean, no conflicts) and pushed with James's explicit authorization; main advanced `adc953a` → `9605652`, Vercel deployment `dpl_Bzm2n5fAhEC1v3yyfZsREZoQaeyM` READY on `pokemondealfinder.com`. This document remains the one authoritative phase ledger; `docs/CLAUDE-HANDOVER-2026-09-13.md` and the two `POKEMONDEALFINDER-*-HANDOVER-*.md` files are historical/resumption indexes, not competing roadmaps. New worktree `wt-consistency` off `origin/main` (branch `consistency-r1`); the 22 other `.claude/jobs/b4b590ce/tmp/wt-*` worktrees and their held commits were surveyed read-only and left untouched (20 of 22 already merged into main; the 2 unmerged ones above are now closed).

**Fixed — verified content inconsistencies (owner brief §1):**

- Homepage (`app/page.js`) claimed "surfacing only the genuine deals" and "We only show genuine deals" unconditionally, while `isDisplayableDeal` (the gate that actually admits a listing to the feed) never required a trusted savings comparison — only `isPremiumDealEligible` (Best Deals / Top 10 / digest) does. A plain listing for a tracked recent release without stored price-condition provenance (`lib/dealQuality.savingsClaimTrusted`) is deliberately still shown, labelled, with no savings claim (17C.7). Reworded the intro paragraph and step 3 ("Savings claims are earned, not assumed") to state this; the comparison rule itself (`DEAL_DISCOUNT_THRESHOLD`, `savingsClaimTrusted`, trust checks) is unchanged. Live-rendered and read on `/` after the fix (see verification below).
- **Jungle Pidgeot gallery bug (root cause found and fixed):** `components/CatalogueBrowser.js`'s `Tile()` — the compact card gallery on both `/sets/[slug]` ("Search & gallery" view) and `/pokemon/[slug]` (via `components/SpeciesCardsBySet.js`'s shared `buildCatalogueItems`) — rendered `{discountPct}% below market` with no shipping-uncertainty check at all, unlike the sibling `SpeciesCard.js`/`DealCard.js` tiles which already call `lib/offerPresentation.offerShipping()`. `lib/deals.js`'s three catalogue projections already carry `shipping` and already gate `discountPct` by `savingsClaimTrusted` (comment: "17C.7: null = plain listing"), so the data was correct — only this one renderer ignored it. Fixed by importing `offerShipping` and gating the −N% badge and the "% below market" line on `shipping.savingClaim !== "none"`, appending `shipping.savingQualifier` — mirrors `SpeciesCard.js`'s existing, tested pattern exactly. Live-verified: `/sets/jungle` → Search & gallery → "Pidgeot" now reads "45% below market **before shipping**" (previously bare "45% below market"); screenshot inspected at the available desktop viewport (see limits below).
- **A second, previously-unaddressed instance of the same two bugs** found on `/search`: `lib/searchEngine.js`'s `providerCatalog()` catalogue-reference projection set `discountPct: deal.discount_pct` with no `savingsClaimTrusted` gate and no `shipping` field at all (the raw `deals.*` row has `shipping`; only the projection dropped it), and `app/search/SearchClient.js`'s `ResultTile` rendered `{Math.round(c.deal.discountPct * 100)}% below market` unconditionally. Fixed both: `searchEngine.js` now gates `discountPct` by `savingsClaimTrusted` and carries `shipping`, matching `lib/deals.js`'s existing convention; `SearchClient.js` now computes `offerShipping(c.deal)` once per tile and gates the badge on `savingClaim !== "none"`, appending the qualifier. (The `/search` *exact-match* deal results render through the existing, already-correct `DealCard`, unaffected — only the catalogue-reference grid tile had this gap.)
- Neutral wording: `DealCard.js`'s primary CTA was unconditionally "View deal on eBay" / "View auction on eBay" even for a plain (untrusted-comparison) listing. Now `isAuction ? "View auction on eBay" : showSavings ? "View deal on eBay" : "View listing on eBay"` — "deal" is reserved for a trusted savings claim. `SealedDealCard.js` already used "View listing on eBay" for all non-auction sealed offers (a different, pre-existing convention for that product type) and was not touched.
- Other pricing-coverage overclaims narrowed (not invented, not removed — worded to match actual coverage): the `/cards` homepage teaser claimed "a real market reference for every card we track" against a catalogue that is `card_catalog` 29,343 rows / 24,623 priced (per the 2026-09-11 handover; ~16% unpriced) — reworded to "…for every card we track, with a real market reference where one exists." The same absolute-coverage phrasing on `/pokemon/[slug]` (both the pilot-species and general species intro paragraphs) was reworded identically. `/methodology`'s "every listing presented as a deal…has cleared the checks below" was checked and left unchanged — it is a claim about the authenticity/matching/freshness gate (`isDisplayableDeal`), not a savings-comparison claim, and is accurate as written.

**Review findings closed without duplicating work (owner brief §2):**

- **Price/shipping fields lost through deal projections** — partially already fixed (`lib/deals.js`'s three `fetchSetCatalog`/`fetchSpeciesCatalog`-family projections already carry `shipping` and gate `discountPct`, confirmed by the existing `tests/scanner/catalogue-shipping-render.test.mjs`, which itself only exercised `SpeciesCard`/`SealedDealCard`, not the actual bug sites). The two real gaps — `CatalogueBrowser.js`'s renderer and `lib/searchEngine.js`'s projection — are fixed above.
- **Removed homepage lanes still reserving inventory from visible lanes** — already fixed (labelled "review fix P3" in `app/page.js`, `lib/homepageVariety.buildHomepageLanes`). Verified in code: a non-rendered lane (`justAdded`/`underPrice`/`auctions` when only `["flagship","grid"]` render) hits `continue` before adding anything to the shared `seenPrintings`/`seenSpecies` dedupe sets, so it contributes zero exclusions. No change needed.
- **Graded-navigation analytics wiring** — already fixed (17C.8: `lib/navLinks.js` declares `graded_clicked`/`analyticsClick` on the shared nav model; `SiteHeader.js`, `NavMenu.js`, `NavDropdown.js`, `SiteFooter.js` all consume it generically). Verified present in current source. No change needed.
- **Documentation confusing PostHog section names with EPN attribution surfaces** — found one real, unfixed instance: `docs/ebay-affiliate-attribution.md` said "'`home_best`' clicks in PostHog" as its own example, but per `docs/deal-first-measurement.md`'s authoritative table, PostHog's `origin_section` for that surface is `best_deals` — `home_best` is the EPN `customid` (and separately the Vercel Web Analytics `page` value). Corrected the doc to give the real values and cross-reference the measurement doc's table, instead of an example that itself conflated the two vocabularies.
- Confirmed (not a finding to act on): the homepage already visibly describes mixed auction/BIN inventory via the `Featured / Buy it now / Auctions / …` mode row (`P2-1` in `tests/scanner/deal-first-review-fixes.test.mjs`) — the older wording-fix item is complete and was not reapplied.

**Verification:**

- `node --test tests/scanner/*.test.mjs`: 3,252 tests, 3,206 pass, 24 fail — diffed test-name-for-test-name against the same suite run on a clean pre-change worktree (`wt-dealfirst`, same base commit): **identical failure set**, only timing digits differ. Zero regressions. (Discovered and worked around a real but unrelated issue in the process: this fresh worktree checked out with CRLF line endings — `core.autocrlf=true` in the shared repo config, not something this phase should or did change — which broke ~9 byte-sensitive regex-based static tests reading source directly; normalized the working tree's on-disk line endings to LF, confirmed via `git diff --quiet` that this is a content no-op that git already reconciles on commit, and staged only the files actually touched by this phase.)
- Updated 3 tests whose literal-string/import assertions were pinned to the old wording and are now updated to assert the corrected contract instead of weakened: `deal-first-r1.test.mjs` (R1-3, CTA regex), `homepage-browse-conversion-uxcvr2.test.mjs` (UX-CVR-2-2, DealCard's now-3-way CTA ternary split out of the shared-loop assertion), `deal-freshness.test.mjs` (the `searchEngine.js` import-line regex).
- `npm run build`: exit0, full route manifest produced, no errors, after copying this worktree's (git-ignored, never auto-created by `git worktree add`) `.env.local` from a sibling worktree — its absence had caused an unrelated `/api/send-digest` page-data-collection failure on the first attempt, reproduced as an environment gap, not a code defect.
- Live-rendered on the dev server and visually inspected (desktop viewport only — see limits): `/sets/jungle` Search & gallery Pidgeot tile (fixed qualifier, confirmed above), `/` homepage intro + step-3 copy (fixed wording, confirmed above).
- **Limits, stated plainly:** the browser tool's `resize_window` did not change the actual rendered viewport in this session (repeated attempts at 390×844 kept rendering the desktop layout), so 390/320px and keyboard-navigation verification could not be captured as screenshots this phase. This is a real gap against the brief's ask, not a "passed" claim — mitigated only by code review: every change in this phase is either plain-text copy or conditional/gating logic (`showSavings`/`savingClaim` checks), with zero className/layout edits in any touched file, so there is no plausible mechanism for a breakpoint-specific regression, but that is an inference, not an observed screenshot. Safari/iOS, physical screen-reader use and print output were not touched by this phase's changes and were not re-verified.
- One affiliate-link tab was opened by mistake while exploring the gallery UI (a misclick during search-box location, not a deliberate interaction) and was closed immediately without further interaction; no purchase path was exercised.

**Newsletter/alert audit (read-only, per owner brief §3 — not activated, no subscribers touched):**

`components/EmailCapture.js` (posts to `/api/newsletter/subscribe`) is **not currently a functioning alert service** — its copy ("Get deal alerts", "Occasional emails about standout Pokemon card deals and market finds", confirmation subject "Confirm your Pokemon deal alerts") describes recurring content-style alerts, but the only mechanism that would ever send such content, the weekly digest (`app/api/send-digest/route.js`), is gated by its own independent kill switch `DIGEST_SEND_ENABLED` (CRM-1B, deliberately separate from `emailEnabled()` per the code's own comment: "the owner enables this one explicitly, only when list size + deal volume justify a first send"). That switch is unset in production per the 2026-09-11 handover ("weekly marketing digest inert"). **Net effect: a visitor who subscribes today receives a confirmation email and then, as currently configured, nothing else — ever — until James explicitly enables `DIGEST_SEND_ENABLED`.** This is distinct from and should not be confused with `PriceAlertForm` → `/api/alerts` (a different, already-live, price-target-based system, hourly `check-alerts` cron, confirmed working per the handover). This is a genuine, currently-true gap between the capture copy's implied promise and the delivery mechanism's actual (intentionally dormant) state — flagged for an owner decision (enable the digest, or soften the copy to not imply active delivery); not changed in this phase, and no real subscriber was contacted or added.

Boundaries respected: no scanner/cron/email/social activation, no DB write/migration, no paid provider call, no push/deploy, no unrelated worktree or held-commit touched, no affiliate purchase path exercised. Reviewable diffs are isolated to the files named above plus their three updated tests; nothing else in the working tree was modified.

### Bounded review of consistency-r1, pre-push (2026-09-13/14)

Owner-requested review before pushing. Local branch only; **not pushed**. Six commits on top of production `9605652`, in order: `ef41875` (fix: savings-claim consistency), `b7a62fa` (docs: PostHog/EPN example), `dca5bdc` (test: updated CTA/import assertions), `6bc4904` (docs: phase-1 ledger), `2c6a0e7` (test: behavioural coverage added during this review), `228afaf` (fix: RelatedDeals mobile layout, added mid-review as a priority correction — see below). Full diff `9605652..HEAD`: 16 files, +346/−38. File list, confirmed against `git diff --name-only` (no line-ending or status noise — this worktree's stray CRLF/LF drift on ~1,070 unrelated files, caused by this repo's `core.autocrlf=true` config interacting with a freshly-created worktree, is a real `git status` artifact but `git diff --quiet` confirms zero content difference on every one of those files, and none were ever staged): `IMPLEMENTATION_STATUS.md`, `app/page.js`, `app/pokemon/[slug]/page.js`, `app/search/SearchClient.js`, `components/AuctionPrice.js`, `components/CatalogueBrowser.js`, `components/DealCard.js`, `components/RelatedDeals.js`, `docs/ebay-affiliate-attribution.md`, `lib/searchEngine.js`, `tests/browser/r3/runtime/data.js`, and five test files. No other worktree, held commit (`1fd6769`/`b2f2e7f` — already merged to main in this session, see above) or unrelated file was touched.

**Regression-test audit.** The three items on the same string my content fixes changed had no *behavioural* coverage before this review — only static source-regex (`deal-first-r1.test.mjs` R1-3, `homepage-browse-conversion-uxcvr2.test.mjs` UX-CVR-2-2, `preorder-guard-17c7.test.mjs` PG-6, matching this repo's own established, frequent convention of source-scan tests). Added in `2c6a0e7`, extending the existing SWC-render harness in `catalogue-shipping-render.test.mjs` (which previously only exercised `SpeciesCard`/`SealedDealCard`) and its `load()` helper (gained an optional `exportName` param, default `"default"`, to reach `CatalogueBrowser`'s named `Tile` export — no behaviour change for existing default-export loads):
- **CatalogueBrowser Tile, known vs unknown shipping, BIN and auction**: rendered across shipping ∈ {undefined, 0, 5} × listing type ∈ {FIXED_PRICE, AUCTION} (6 cases) plus one untrusted-comparison case. Unknown shipping asserts *no* percentage claim anywhere in the rendered text (this is the exact state the original bug got wrong); shipping=0 asserts the "before shipping" qualifier is present; confirmed shipping asserts it is absent; auctions additionally assert the "Est. total" label persists in every state.
- **searchEngine projection preserves shipping**: the actual object-literal projection is extracted from `lib/searchEngine.js` by its stable field names (same technique already used on `lib/deals.js` in this file) and evaluated with a fixture `deal` across shipping × trusted/untrusted (6 cases): `shipping` passes through unconditionally in all 6, `discountPct` is null whenever `trusted` is false, independent of shipping.
- **SearchClient ResultTile**: `ResultTile` is an unexported inner function — reaching it behaviourally would mean changing the component's export surface, which is outside this bounded fix. Its coverage is a **source** assertion (explicitly commented as such) that `offerShipping`, the `showSavings` gate and the qualifier interpolation are present and wired together, and that the old unconditional `{c.deal && (` form is gone. This is real but weaker evidence than the CatalogueBrowser/searchEngine tests; recorded here rather than implied to be equivalent.
- **DealCard CTA wording**: rendered for the `bin_compared` (trusted), `bin_plain` (untrusted) and `auction` fixtures from `DEAL_STATE_FIXTURES`; asserts "View deal on eBay" only for the trusted case, "View listing on eBay" only for the untrusted case, and "View auction on eBay" for the auction case regardless of savings state — the three-way switch is now proven at runtime, not only matched as a source string.
- The three pre-existing tests whose literal-string assertions the content fix changed (`deal-first-r1.test.mjs`, `homepage-browse-conversion-uxcvr2.test.mjs`, `deal-freshness.test.mjs`) were updated to assert the **corrected** contract (the new three-way CTA ternary; the `searchEngine.js` import line gaining `savingsClaimTrusted`) — not weakened, not deleted; each diff is a regex/string update matched to the actual new source, and `homepage-browse-conversion-uxcvr2.test.mjs`'s UX-CVR-2-2 pulled DealCard out of its shared loop with SpeciesCard/CatalogueBrowser (whose CTA source was not touched) into its own assertion of the new three-way form.

**Test totals, exact.** `node --test tests/scanner/*.test.mjs`, run to completion (process exit code 1 — expected and unchanged from the pre-existing baseline, since `node --test` exits non-zero whenever any test fails, pre-existing or not): **3,271 tests, 3,225 pass, 24 fail, 22 skipped, 0 cancelled, 0 todo.** The 24-name failing set was diffed byte-for-byte (sorted, deduplicated, timing digits stripped) against the same suite run on an untouched sibling worktree (`wt-dealfirst`) at the same base commit, three separate times across this review (after the content fix, after the added regression tests, after the layout fix): **identical in every case.** This is "no additional failures against a suite that already had 24 failing before any of this session's work," not "a passing suite" — stated plainly because it is not the same claim. `npm run build` (Turbopack, this worktree's real `.env.local`, not the isolated fixture): **exit 0** on the final commit `228afaf` (confirmed by rerunning after the layout-fix commit specifically, not inferred from an earlier run on a different commit) — full route manifest produced, no errors. An earlier build attempt failed on `/api/send-digest` page-data collection; root-caused to this fresh worktree never having had `.env.local` copied into it (git-ignored, not created by `git worktree add`) — copied from the sibling `wt-dealfirst` worktree, not a code defect, and unrelated to any change in this phase.

**Verification record, corrected.** The original report overstated what was checked:
- Viewport (390/320px) and keyboard-operation checks for the **first three** fixed items (homepage copy, CatalogueBrowser/searchEngine/SearchClient savings gating, DealCard CTA wording) were **not completed** — the interactive browser tool's `resize_window` did not change the rendered viewport in that session, and no fallback was attempted at the time. That gap is **not mitigated by "no className changes"** — text-only and conditional-render changes can absolutely still affect layout (a qualifier string getting longer, a badge appearing/disappearing, a button's own label length all reflow surrounding content), so the earlier claim that this was a safe inference is retracted as stated. The honest status for those three items remains: verified at the desktop viewport the browser tool actually rendered, cross-checked at the DOM level by the new behavioural tests above, but **not** visually verified at 320/390px or for keyboard operation. This gap is carried forward, not closed.
- For the **fourth item** (the RelatedDeals layout fix, added mid-review), viewport and keyboard-adjacent checks **were** completed, using the existing provider-disabled local fixture tooling as instructed (`scripts/buildR3NextFixture.mjs` + `runR3NextFixture.mjs`, `tests/browser/r3/runtime/`) rather than live search or any affiliate link: a headless-Chrome CDP driver (Node's built-in `WebSocket`, the same zero-dependency pattern as the existing `scripts/_verifyAnalyticsRuntime.mjs` — not committed to the repo, ad hoc for this session) at 320/390/430/1280 CSS px, light and dark `prefers-color-scheme`. Overflow was checked **programmatically** (`element.scrollWidth > element.clientWidth` on every leaf node inside each rendered `<article>`), not just eyeballed: confirms zero price/comparison-text clipping after the fix at every tested width, both schemes; the three remaining flagged elements (a long set name, a "found Today" timestamp, an auction status line) all resolve to the pre-existing, intentional `truncate` (ellipsis) convention already used elsewhere in the app, not silent clipping. **Chromium only — Safari/WebKit was not tested; none was available in this environment.** No keyboard-focus/tab-order check was performed for this item either (the CDP driver only drove navigation, viewport and screenshot capture) — that specific gap also stands.
- Distinguishing observed vs. assumed network activity: the isolated fixture provides two **independent** guarantees stronger than a client-side network trace — (1) a webpack compile-time plugin (`R3ProviderIsolation`) that throws the build if `lib/deals`, `lib/supabaseAdmin`, `lib/supabaseClient`, `lib/pokemonPriceTracker`, `lib/email`, `lib/searchEngine`, `@supabase`, `posthog-js` or the analytics client resolve into the bundle at all — the build succeeded, so none did; (2) a Node `--require` preload network guard (`tests/browser/r3/runtime/networkGuard.cjs`) active for the whole server process before Next starts. Both are static/process-level guarantees that no provider module could run server-side, which is stronger evidence than "no request was observed" (an attempted-but-blocked request would still show as an observation gap, not a guarantee) — stated this way deliberately, per the instruction to distinguish the two. One affiliate-link tab **was** opened by mistake earlier in this review (a misclick locating a search box in the interactive browser tool, not a deliberate interaction) and closed immediately; closing it demonstrates nothing about whether the request itself completed — for the record, it did (the tab loaded a real eBay listing page before being closed), i.e. one real, unintended GET request reached eBay's own servers this session. No purchase, form submission, or further interaction occurred on it.

**Digest/newsletter — configuration inspected, precisely.** Re-confirmed unchanged since the finding above: `DIGEST_SEND_ENABLED` was checked by reading `app/api/send-digest/route.js`'s own `digestSendEnabled()` function and its guard clause, and by reading the 2026-09-11 handover's statement that it is unset in production — **not** by reading any live production environment variable or credential (no access to production env exists in this session). This worktree's own local `.env.local` (copied from `wt-dealfirst` for the build-verification step above) was not inspected for this key and its value, if any, says nothing about production. The claim is specifically and only about the **digest send path** (`app/api/send-digest/route.js`) — it does not extend to `PriceAlertForm`/`/api/alerts` (confirmed separately live, per the same handover) or to `emailEnabled()`/transactional mail generally, which are independent gates. Digest sending remains untouched and disabled; nothing was activated; the newsletter-copy question (soften the wording vs. enable the digest) is queued as a separate owner decision, not decided or actioned here.

**Priority fix added mid-review** (commit `228afaf`): a production mobile layout defect in "More live deals right now" (`components/RelatedDeals.js`, rendered on `app/deals/[id]/page.js` only — both its live and expired branches, confirmed the only call site by source search), reported by the owner with screenshots. Root cause: this was the one `DealCard` grid in the app starting at `grid-cols-2` on mobile instead of `grid-cols-1` (every sibling grid — `DealGrid.js`, `app/page.js`, `app/deals/page.js`, `app/best-finds/page.js` — already agrees on `grid-cols-1` at the base breakpoint, which the new regression test now pins). Fixed to match. A second, narrower defect found only during verification at the corrected width: a 4+ digit AUD-converted price still overflowed `DealCard`'s `text-2xl` headline price span at 320px and was invisibly clipped by the card's own `overflow-hidden` (kept, for the rounded artwork corners) with no ellipsis or affordance — fixed by adding `break-words` to that span (and the two equivalent spans in `AuctionPrice.js`, for consistency), not by shrinking the font, changing decimal precision, or removing `overflow-hidden`. The existing R3 fixture's `fetchRelatedActiveDeals` was a stub returning `[]` — meaning this exact section, and its defect, was **unreachable** through the provider-disabled harness until this session populated it with the existing `DEAL_STATE_FIXTURES` variety (`long_name`, `bin_shipping_unconfirmed`, `auction_shipping_unconfirmed`, `non_usd`), closing that coverage gap for future sessions too. Full verification detail (widths, schemes, overflow methodology) is in the bullet above; regression test in `tests/scanner/related-deals-mobile-grid.test.mjs`.

Still outstanding after this review: 320/390px and keyboard verification for the three earlier-fixed items (homepage copy, catalogue/search savings gating, DealCard CTA wording); Safari/WebKit verification for all four fixed items; a decision on the newsletter copy vs. digest activation.

### Deployment (2026-09-14) — consistency-r1 pushed and verified live

James approved deploying the reviewed range. Pre-push checks, all confirmed: seven exact commits `ef41875`, `b7a62fa`, `dca5bdc`, `6bc4904`, `2c6a0e7`, `228afaf`, `0d25470` (HEAD); `git diff --name-only 9605652 HEAD` = the 16 files already named above, nothing else; `git fetch origin main` immediately before push showed `origin/main` unchanged at `9605652` (`96056526e598d2082f5a1dff55270ec06e69f344`) — no divergence to report. Tested-code note: the last local `npm run build` success was verified **at `228afaf`** (re-run specifically after the layout-fix commit, exit 0, full route manifest); `0d25470` on top is a documentation-only commit (`IMPLEMENTATION_STATUS.md` alone) added after that build, not itself locally rebuilt — Vercel built it fresh at deploy time regardless, per its normal per-push behaviour, so this is a process note rather than an open risk. No unrelated worktree or held commit (`1fd6769`/`b2f2e7f`, already closed) was touched.

**Push**: `git push origin consistency-r1:main` — fast-forward, `9605652..0d25470`, accepted directly (no classifier hold this time). `origin/main` confirmed at `0d2547077c984b848b1a0af6084a3abb6e23978b` post-push.

**Deployment**: `dpl_5X32kbHB3xhrVSTwWrEKDgnunXT2`, target `production`, commit SHA `0d2547077c984b848b1a0af6084a3abb6e23978b` (exact HEAD, confirmed via the deployment's own `githubCommitSha` metadata, not inferred). Reached `READY`; `alias` includes `pokemondealfinder.com` with `aliasError: null`. Polled via the Vercel API until both conditions held before any production check began.

**Production verification performed** (read-only page loads unless noted; all via `curl` where possible to avoid any risk of an accidental click):
- Homepage copy (item 1 of the original review): `curl https://pokemondealfinder.com/` — confirmed present verbatim: "Savings claims are earned, not assumed", "...shown as plain listings, clearly labelled, with no savings claim", and the `/cards` teaser "...with a real market reference where one exists".
- CatalogueBrowser gallery fix (the Jungle Pidgeot bug): the gallery view is client-rendered behind a toggle, so `curl` alone couldn't reach it — used the interactive browser, `Search & gallery` toggle then a search for "Pidgeot", read via the accessibility tree (not a screenshot eyeball): the #08/64 Holo Rare tile (an active deal) reads **"45% below market before shipping"**; the #24/64 Rare tile (no active deal, reference-only) correctly shows no percentage claim at all. Confirms the fix live in production, in both the "has a savings claim" and "has none" states.
- `/search` and `/deals/[id]` (RelatedDeals fix) were **not** exercised in production. For `/search`: reaching the specific fixed code path (`ResultTile`'s catalogue-reference badge) requires submitting a real query, which calls `runCardSearch` → live PokemonPriceTracker `searchCards` — a paid-provider call; not run. For `/deals/[id]`: read `lib/pokemonPriceTracker.js`'s `getFullPriceAnalysis` (imported by that page) before deciding — it calls `fetchPPT()` directly, and its own comment states an uncached render costs "~1 provider credit". This route was therefore **established to be able to trigger a paid provider call**, not established to be safe, so per instruction it was **not** visited live. The RelatedDeals fix's evidence of record remains the provider-isolated fixture verification recorded above (compile-time module exclusion + network guard, CDP screenshots, programmatic overflow checks at 320/390/430/1280px, light/dark) — production rendering of that specific fix was not exercised, and this is not claimed otherwise.
- No digest send was enabled, no social automation was touched, no affiliate purchase or form-submission path was exercised.

**Incident, disclosed in full**: while navigating the interactive browser to reach the gallery toggle, two clicks aimed at the search input landed instead on an adjacent "View auction/deal on eBay" button (once locating the toggle, once immediately after switching views, before the layout had settled) and opened real eBay listing pages in new tabs. Both were closed immediately with no further interaction, form submission, or purchase — but per the standing instruction to distinguish observed activity from assumptions: closing the tab does not undo the request that already completed. Two real, unintended GET requests reached eBay's own servers as page loads during this deployment's verification pass (in addition to the one during the earlier review session). No credential, checkout, or write action occurred on either.

Production is now `0d25470`, matching the fully reviewed `consistency-r1` range. Remaining open items, unchanged in kind from the pre-push review: 320/390px and keyboard verification for three of the four fixes; Safari/WebKit verification for all four; the newsletter-copy-vs-digest-activation decision; and now also production-specific verification of the `/search` and RelatedDeals fixes specifically, deliberately deferred per the paid-provider-call risk established above.

### Graded-category browsing pilot (Claude, local, 2026-09-14)

James asked for the next bounded phase — dedicated deal browsing, graded cards as the pilot, homepage unchanged — with two diagnoses required first (a reported "identical results regardless of filters" bug on `/deals/graded`, treated as an observed symptom rather than a proven cause; and a read-only inventory funnel breakdown, since the previous public 13-offer view does not by itself prove only 13 exist), then a bounded pilot reusing existing components, verified safely (request allow-list before any browser navigation, provider-disabled fixtures, actual result identity/order checks, screenshots across widths/schemes/keyboard), with no deployment, paid provider calls, newsletter activation or social publishing, and the pilot held for review before any other category. New worktree `wt-graded` (branch `graded-browsing-r1`), branched off the tip of the already-reconciled `consistency-r1` lineage (`646d52a`, itself production `0d25470` plus the previously-held local-only ledger commit `f1d0eb6` reconciled in) — confirmed via `git log`, not assumed; `origin/main` was at `0d25470` with no incoming commits at branch time. The 25 other `.claude/jobs/b4b590ce/tmp/wt-*` worktrees and their held/merged commits were left untouched.

**Diagnosis 1 — the "identical results" report.** Root cause is a testing-methodology artifact, not a functional defect: `/deals/graded`'s server render always returns page 1 with no filters applied, by the code's own explicit design (static/cacheable default render — see `lib/deals.js`'s cache-key comment), while real filtering happens client-side after hydration via `/api/deals-page`. Requesting the bare URL repeatedly (or via a tool that only reads server HTML) will always see the same unfiltered page 1, which matches the report's symptom without there being a filtering bug in the post-hydration path. That said, this wasn't a false alarm end to end — investigating it surfaced five real bugs, listed below, several of which *would* have made even the real client-side filtering behave incorrectly for grader/grade once someone tried it.

**Diagnosis 2 — inventory funnel (read-only Supabase `SELECT`s only, zero eBay/PPT calls, run via `graded-funnel.mjs`, ad hoc for this session, not committed).** Point-in-time snapshot, re-run once more immediately before writing this entry to keep the numbers current (they moved slightly between runs earlier in the session — this is live, constantly-refreshing inventory, not a static fixture, so a later re-check will not exactly match): 643 historical graded rows stored → 17 currently active → 17/17 pass `isDisplayableDeal` (zero disqualifications, zero visual-authenticity holds) → 16 distinct watchlist+grader+grade groups → 16 displayed (under the 24/page limit, so nothing is truncated by pagination either). Breakdown of the 17 active rows: grader PSA 12 / CGC 5; grade 9×7, 10×5, 7×3, 8×1, 1×1; marketplace EBAY_US 6 / EBAY_AU 4 / EBAY_GB 3 / EBAY_CA 3 / EBAY_DE 1 / EBAY_IT 0; discount_pct bands 10–20% ×5, 20–40% ×7, 40%+ ×5 (none under 10%, none null). **Conclusion: the constraint is supply, not classification, eligibility or presentation** — every stored active graded row already clears every display gate. A grader/grade filter UI (built below) helps a visitor navigate this small set faster; it cannot and does not create volume. Per the brief's own instruction, if broader graded-inventory acquisition is ever wanted, that is a separate, costed proposal — not something this phase activates.

**Five real bugs found and fixed**, beyond what was originally reported, all in the category-page path only (species/set pages already had the correct behaviour and were the reference pattern copied from):
1. `app/api/deals-page/route.js`'s category branch silently dropped `grader`/`grade` query params entirely — they were parsed nowhere in that branch, so no UI could ever have passed them through even before today.
2. `lib/deals.js`'s `fetchDealsPageUncached` (the function the API route actually calls for category pages) had no `grader`/`grade`/search parameters in its signature at all — even if the route had forwarded them, the query builder had nowhere to apply them. Fixed by switching the category path onto the same shared `planDealFilters` contract (`lib/dealFilters.js`) that species/set pages already use, plus an `ilike` title search gated at ≥2 characters.
3. The graded category page rendered a clickable "Raw" pill next to the (also clickable) "Graded" pill inside a panel that is, by the category's own preset, graded-only — a real, visible contradiction (a control offering a state the page can never actually enter). Fixed by locking card type to a non-interactive "Graded cards only" label when the category defines a fixed `cardType`.
4. The same API route branch computed `sort: userSort && userSort !== "newest" ? userSort : cat.defaultSort ?? "newest"` — an explicit `?sort=newest` from a user was silently coerced back to whatever the category's own default happened to be, which is usually also `"newest"` and so invisible, but not always, and never correct: an explicit choice should never be overridden by a fallback. Fixed to `sort: userSort ?? cat.defaultSort ?? "newest"`.
5. **Found during CDP verification, not part of the original diagnosis** (a genuine bonus finding): `lib/deals.js`'s cross-page dedup key fell back to `card_tcgplayer_id` alone for every non-sealed deal, meaning two different grades of the same physical card (a PSA 9 and a PSA 10 of the same Charizard, say) collapsed into a single tile — the grid would silently drop one of two genuinely distinct, comparison-worthy listings. Fixed by including `grader`/`grade` in the key for graded rows only (raw and sealed dedup keys are unchanged). Covered by a dedicated test (`r6-category-currency.test.mjs`) using a same-card-different-grade fixture alongside a true duplicate (same card **and** same grade), asserting the former survives as two tiles and the latter still collapses to one.

**Pilot, bounded to `/deals/graded` only, no new components:** card-type lock (bug 3 above) with a `lockedCardType` prop threaded from `DealCategoryPage.js` → `DealGrid.js` → `FilterBar.js`; an opt-in, JS-free search-within-inventory control (`SearchWithinRow`, a plain `<form method="get">` with hidden inputs for the other active params — no client JS, no new hydration surface) rendered only when `kind === "category" && slug === "graded"`; and a relabel of the "Country" filter to "Listing marketplace" with an added clarifying line ("Which eBay site the listing is on — not where it ships. Shipping destination is the 'Shipping to' control above.") — this was a real, pre-existing conflation: `marketplace` is an exact-match eBay-site column, while the page's separate "Shipping to" control is the viewer's delivery/currency region, and the old "Country" label implied they were the same thing. `DealFilterChips.js`'s applied-chips row and empty-state copy both gained the search term additively (a "Search: …" chip, a "Clear search" step ahead of "Clear all") without changing behaviour for any other category. Homepage and every other deal category are unchanged — confirmed by diff scope (only the files listed in the commits below were touched) and by the unmodified `graded`-only conditionals gating every new code path.

**Test totals, exact and re-verified.** `node --test tests/scanner/*.test.mjs` on this phase's final commit: **3,292 tests, 3,246 pass, 24 fail, 22 skipped, 0 cancelled, 0 todo.** To get an honest regression comparison, the earlier working assumption in this session — diffing against the long-standing `wt-dealfirst` reference worktree — turned out to be **stale**: `wt-dealfirst` sits at `926157f`, a commit that predates this entire `consistency-r1` phase (production has since moved to `0d25470`, this branch's actual parent), so it is missing ~20 tests `consistency-r1` itself added and is not a same-base comparison. Corrected by building a throwaway detached worktree at this phase's true branch point (`646d52a`) instead: **3,271 tests, 3,225 pass, 24 fail, 22 skipped** — after applying the same CRLF-normalization no-op this session has used at every fresh-worktree checkout (`core.autocrlf=true` again converting on checkout; confirmed via `git diff --quiet` as a true no-op, never staged). The 24 failing test names, stripped of timing digits and sorted, are **byte-for-byte identical** between the branch point and the final phase state — a real "no additional failures" result, not an "everything passes" one, stated in those terms deliberately. Net: this phase added exactly 21 new tests (7 extending `r6-category-currency.test.mjs`'s harness with grader/grade/search/dedup fixtures, 14 in the new `tests/scanner/graded-browsing-pilot.test.mjs`), all passing, zero regressions.

**Incident during that comparison, disclosed in full.** Building the throwaway `646d52a` worktree needed its own `node_modules`; rather than a slow reinstall, a Windows directory junction was pointed at `wt-graded`'s real `node_modules` to reuse it. `git worktree remove --force` on the throwaway worktree afterwards recursed through that junction rather than treating it as a boundary, deleting the *target* directory's contents — i.e. it wiped out `wt-graded`'s real `node_modules`, not just the junction. Caught immediately by the next verification step failing (`Cannot find module '@supabase/supabase-js'`). No source file, git history, or commit was touched — `package-lock.json`/`package.json` were confirmed unchanged (`git diff --quiet`) before restoring via `npm ci` (647 packages). Re-ran both the full test suite and a full `rm -rf .next && npm run build` afterwards: identical 3,292/3,246/24/22 totals, identical failing-test-name set, and a clean `exit 0` build — no lasting damage, but recorded here rather than omitted, per this project's standing disclosure convention for session incidents.

**Production build**: `rm -rf .next && npm run build` — **exit 0**, full route manifest produced, no errors, run twice (once before the `node_modules` incident, once after the restore) with identical results.

**Browser verification (provider-disabled R3 fixture, headless Chrome via CDP, Node's native `WebSocket`, ad hoc for this session and not committed — same zero-dependency pattern as `scripts/_verifyAnalyticsRuntime.mjs`).** A real network allow-list was enforced via `Fetch.enable`/`Fetch.requestPaused` (block anything not matching the fixture's own origin or the CDP port itself), not relied-on careful clicking, per the explicit instruction that a prior verification's two accidental real-eBay-tab opens must not recur — this time, an out-of-allowlist request is a hard `BlockedByClient` failure at the network layer, structurally impossible to complete by accident. Result: **49 requests blocked** across the run (all `tcgplayer-cdn.tcgplayer.com` image loads from the fixture's own simulated card art, expected and harmless — the fixture never claims to serve real images), **zero** eBay/PPT/analytics requests of any kind, confirmed by inspecting every blocked URL, not just the count.
- **Filter/sort/search identity** (comparing the actual rendered card identities, not just that "a request happened"): bare `?country=EBAY_US` → `["Charizard","Charizard"]`; `?grader=PSA` → same two (both are PSA); `?grader=PSA&grade=10` → narrows to one; `?grader=CGC` → `[]` (correctly zero — this fixture's CGC rows are on a different marketplace, exercising the marketplace/grader interaction honestly rather than a same-marketplace-only fixture); `?country=EBAY_GB` → `["Blastoise"]`; `?sort=price_asc` vs `?sort=price_desc` → same two IDs, confirmed non-identical order by comparing the full JSON array, not just presence; `?q=Blastoise` → `["Blastoise"]`; `?q=nonexistentcardxyz` → `[]` with the "Clear search" empty-state copy present. Distinctness assertions: bare-vs-PSA identical (correct — PSA is the only grader in the pinned-US baseline), PSA-vs-CGC **not** identical, price_asc-vs-price_desc **not** identical (i.e. sorting demonstrably reorders, not just relabels).
- **RegionRedirect discovery**: the bare, unpinned `/deals/graded` URL (no explicit `?country=`) auto-applied the fixture's simulated AU-visitor default and returned `["Venusaur"]`, differing from the pinned-US baseline — this is correct, pre-existing, unrelated behaviour (confirmed by reading `RegionRedirect.js`'s own comment: "an explicit ?country= in the URL always wins"), not a bug; every other check in this pass explicitly pins `country=` to remove that variable, and this one dedicated check confirms the auto-default itself still resolves correctly rather than being silently disabled.
- **Contradictory-control check** (bug 3, live-rendered): a clickable "Raw" control is **absent** on the graded category page (confirmed `false`); the locked "Graded cards only" label is **present** (confirmed `true`).
- **Keyboard check**: first `Tab` stop from a fresh load lands on the pre-existing "Skip to content" link — correct and unchanged; this confirms the new search input and locked-type label don't intercept focus ahead of the existing skip target, but does not by itself prove full tab-order correctness through the rest of the new controls (see limits below).
- **Screenshots**: captured at 320/390/430/1280 CSS px × light/dark `prefers-color-scheme`, scrolled in increments to cover full page height, saved to this session's scratchpad (`graded-verify/graded-w{width}-{scheme}-scroll{n}.png`) — visually inspected, not pixel-diffed against a baseline (there is no prior graded-category screenshot to diff against, since this control didn't exist before this phase).

**Limits, stated plainly.** Chromium only — no Safari/WebKit available in this environment, consistent with every prior phase's stated limitation. The keyboard check confirms the first Tab stop only, not full tab-order/focus-visible correctness through the search input, locked-type label, and grade/grader pills specifically. The inventory-funnel numbers are a live snapshot (already observed to drift by one row between two runs in the same session) — treat them as "supply is currently very small and this is why," not as a fixed count to build future logic against. No production deployment, push, paid provider call, newsletter activation, or social publishing occurred at any point in this phase; the pilot is held on the local `graded-browsing-r1` branch for review, per instruction, before any other category is attempted.

**Commits** (all local, unpushed, on `graded-browsing-r1` off `646d52a`): `4ea1223` (fix: category filter/search/dedup data-layer fixes, bugs 1/2/5), `3239a6b` (feat: the pilot UI — locked type, search-within, relabeled marketplace, bug 3), `05a2387` (test: the 21 new tests plus the extended R3 fixture), plus this documentation commit. `git diff --name-only 646d52a HEAD` (excluding this file): `app/api/deals-page/route.js`, `lib/deals.js`, `components/DealGrid.js`, `components/FilterBar.js`, `components/DealCategoryPage.js`, `components/DealFilterChips.js`, `tests/scanner/r6-category-currency.test.mjs`, `tests/scanner/graded-browsing-pilot.test.mjs` (new), `tests/browser/r3/runtime/data.js` — nothing else; the homepage (`app/page.js`) was not touched.

**Next phase queued, not started**: dedicated deal browsing, beginning with graded filters and inventory depth. No code for it was written or investigated in this session. *(Corrected below: this phase has since been completed — see "Graded-category browsing pilot" above — this note is stale as of 2026-09-14 and is left in place, not deleted, so the ledger's own history stays legible.)*

### Review closure: graded-category browsing pilot (2026-09-14)

James held deployment and requested a bounded acceptance review of the pilot above, before any push. Full detail (evidence, exact CDP logs, code line references) lives in this session's transcript; this entry records the closure verdict and the exact, reproducible checks behind it.

**1. Commits and range.** Five commits are in scope for a future deploy, in order: `646d52a` (docs-only — see below), `4ea1223` (fix: filter/search/dedup data-layer), `3239a6b` (feat: pilot UI), `05a2387` (test: 21 new tests), `8b2b3a2` (docs: phase ledger). `646d52a` is a **faithful reconciliation** of the previously local-only, never-pushed `f1d0eb6` (from the separate `wt-consistency` worktree) onto this branch's parent `0d25470` (current production) — confirmed identical: same tree hash (`92391c1b...`), same parent, same author/date, only committer metadata differs, consistent with a cherry-pick. `f1d0eb6` itself was never merged to `origin/main` (confirmed via `git merge-base --is-ancestor`), so `646d52a` is not redundant — it is the only place that ledger content exists relative to production and must travel with any future push. **All five commits are intended** for the proposed range; `git diff --name-only 0d25470..HEAD` touches only the 10 files already named in this phase's own entry above, confirmed again at closure time. Nothing has been pushed; `graded-browsing-r1` is 5 commits ahead of `origin/main` (still at `0d25470`).

**2. Acceptance table.**

| Capability | Status | Notes |
| --- | --- | --- |
| Visible grader and grade controls | **Implemented + verified** | Live CDP: PSA/CGC/BGS/SGC and Grade 10/9.5/9/... present, scoped to the graded category, correct tab order once the panel is open. |
| Search within inventory | **Implemented + verified, with a real gap found** | Filtering itself (JS enabled) is correct (`q=Blastoise` → exactly `["Blastoise"]`). Submission is genuinely JS-free (confirmed with script execution fully disabled: a real native `<form method=get>` GET navigation updates the URL with no page JS at all) — but **results never actually filter without JS**, since the entire fetch/render is client-side; this is the pre-existing architecture for every filter on this shared component, not new to search. **New finding**: the search form's hidden inputs (meant to carry `country`/`sort`/other active params through the submit) are built from this component's always-empty SSR snapshot, so a no-JS submission silently drops every other active param — confirmed reproducible: starting from `?country=EBAY_US`, a no-JS search submit landed on `?q=Blastoise` alone, losing `country`. Not fixed this turn (no further code changes requested); recorded as a material gap in §5 below. |
| Accurate matching counts | **Implemented + verified** | Count is literally `view.deals.length` (the rendered array), never a separate/stale number; confirmed "· 1 match" on a query narrowed to exactly one card. |
| Active-filter chips and Clear all | **Implemented + verified** | Live: `Graded✕ PSA✕ Grade 10✕ Clear all` on a filtered view; additive to the pre-existing chip system, non-graded categories unaffected. |
| Combined filters and sorting | **Implemented + verified** | `grader=PSA&sort=price_asc` → PSA 9 ($1,350) then PSA 10 ($2,175); `sort=price_desc` → reversed. (An earlier check in this same closure pass used a species-name-only selector and wrongly suggested sort wasn't reordering under a combined filter — corrected by reading full card price/grade text; recorded here so the false start isn't silently dropped.) |
| Pagination when enough results exist | **Implemented, not empirically exercised** | Reuses the pre-existing, unmodified `Pagination.js` and the shared `totalPages` computation (no code in this phase touches either). Current real supply (16–17 active graded rows) sits under the 24/page threshold, so a second page has not been observed with real or fixture graded data. |
| Back/forward and reload state | **Implemented + verified** | Reload and back/forward on a filtered URL show a neutral loading skeleton (never stale/wrong content), then settle to the exact correct state — confirmed byte-for-byte (`back`-settled state == the original forward state, and vice versa). One inherent, pre-existing (not introduced by this phase) caveat: a **fresh, direct navigation** has a sub-10ms (measured locally) pre-hydration flash of the true unfiltered SSR HTML before hydration takes over — see §5. |
| Mobile filter interface and keyboard access | **Implemented; partly verified, partly inconclusive** | Once the mobile "Filters" panel is open, keyboard tab order through sort → marketplace → listing type → grader → grade is correct and complete (confirmed live). Whether the panel's own disclosure **toggle** responds to a real keyboard Enter or touch tap is **not established** by this session: this session's headless CDP automation could not reliably deliver a synthetic Enter-key or mouse-click that triggered it, even though the identical `onClick` handler fires correctly when invoked directly in the page (confirmed via a direct DOM `.click()`, which did open the panel) — most consistent with a CDP/headless input-delivery limitation, not a confirmed product defect, but left genuinely unresolved rather than assumed either way. A real-device/manual keyboard check is recommended before treating this specific step as fully verified. |

**3. Dedup identity and shared-code regression check.** Confirmed live (not just in the unit test) that two different grades of the same printing render as two distinct tiles: `grader=PSA` on the fixture shows both a PSA 9 ($1,350) and a PSA 10 ($2,175) Charizard, not one collapsed row. The two shared-code changes this phase made (`planDealFilters` wiring into `fetchDealsPageUncached`, and the `sort: userSort ?? cat.defaultSort` fix in the API route) are **not graded-only** — the sort fix's own source comment names `/deals/auctions` as the concrete category it was already silently breaking (an explicit "Newest" request there was being forced back to "Ending soon"). Both changes only ever add behaviour when a request explicitly supplies `grader`/`grade`/`q` (absent for every non-graded category's normal traffic), and the full regression suite shows the identical 24-failure baseline with zero new failures across every category's existing tests — confirmed at both the stale-baseline-corrected true branch point (`646d52a`) and again after the `node_modules` incident's recovery (see the phase entry above). No other category regresses; the sort fix is a strict, positive, cross-category correctness improvement.

**4. Inventory provenance, stated precisely.** The funnel numbers in this phase's entry above (643 stored / 17 active / 16 grouped, re-checked once more for this closure and unchanged) are: **timestamped** 2026-09-13/14, from a live, constantly-refreshing table, not a fixed snapshot; **"active" means `is_active=true`** in the `deals` table, a status the `verify-deals` cron flips to `false` once eBay's own single-item lookup confirms SOLD, ENDED (404/410), or an auction is retired below its publish floor — normal listing churn, not a defect (see the queued proposal's §2 for the exact mechanism). Critically, this **covers only rows the scanner has already discovered, matched, and persisted** — it is a read against this application's own `deals` table, never a query against eBay itself, and it is bounded by the scanner's own per-card watchlist coverage and Browse-quota budget (detailed in the queued proposal's §1 and §3). **17 active rows must not be read as "eBay has approximately 17 graded Pokemon listings" — it means the scanner has found and kept 17 active so far, within its own discovery constraints**, which the queued proposal below addresses directly.

**5. SSR limitation, verified precisely.** Confirmed by reading `app/deals/[id]/page.js`'s own function signature (it does not even destructure `searchParams`): the server ignores the query string entirely and always renders page-1/default HTML, by design, for static cacheability. Verified via CDP that **direct filtered links do reach the correct final state**: fine-grained timed sampling (0/10/25/50/75/100/150/200/300/500/800/1200ms) after a fresh navigation to `?grader=PSA&grade=10` showed the true unfiltered SSR paint for under 10ms, then the correctly-filtered single result for the rest of the observed window — no point where stale/default content is held and misrepresented as matching the selection. Reload and back/forward (tested across two different filter states) both show a neutral loading skeleton during the transition, never the wrong filtered content, then settle exactly correctly. This sub-10ms flash is the same pre-hydration architecture already used by species/set pages before this phase, not a new defect; its real-world duration depends on device/network speed and was not measured under throttled conditions.

**Material gaps carried forward, not fixed this turn (per instruction: no further code changes):**
- The search-within form drops other active URL params (country, sort, listing type, price) when submitted with JavaScript disabled, because its hidden inputs are built from the client component's always-empty SSR snapshot rather than the real URL — a real, reproducible, no-JS-only correctness gap (§2 in the table).
- The mobile filter-panel toggle's keyboard/touch activation is unresolved (this session's tooling limitation, not a confirmed defect) — needs a real-device check.
- Pagination has no empirical exercise with graded data (insufficient current supply) — the code path is shared/pre-existing and low-risk, but unobserved with grading filters specifically.

**Queued, not activated**: a graded-inventory-growth proposal (`docs/graded-inventory-growth-proposal.md`) — how graded listings are actually discovered (a title-heuristic on top of the per-card allocator, not a dedicated graded search), why rows go inactive, today's measured scan budget (5,000 calls/day total, ~4,608 already logged and ~5,453 projected on the day of this check — already at or over the daily ceiling), and two bounded, zero-extra-spend options (reallocate a slice of the existing explore budget toward graded-active cards, or first measure the title-heuristic's miss rate) with named success measures. No budget, matcher, watchlist, or schedule change has been made. Deployment remains held; nothing in this closure pushes, deploys, or activates anything.

### Review gap closure (2026-09-14) — four specific acceptance gaps, deployment still held

James kept deployment held and asked for four specific gaps to be closed without expanding the phase, plus corrected wording where a prior claim overstated what was actually verified. All four addressed; none required touching any other worktree, the growth proposal's non-activation, or deployment.

**1. No-JS search — honesty fix, not a server-rendering rewrite.** Weighed both options James gave explicitly: (a) support server-filtered results while preserving params, or (b) stop presenting a form that can't deliver. Option (a) would require `app/deals/[id]/page.js` to read `searchParams` at request time, which breaks the category route's static cacheability - the exact tradeoff `DealGrid.js`'s own long-standing architecture comment explains it deliberately avoids, for every filter on this page, not just search. That's an architectural change well beyond "smallest correct change" for a search-only ask, so option (b) is the correct, proportionate fix. `components/FilterBar.js`'s `SearchWithinRow` is now wrapped in a `<noscript>` pair: a `<style>` that hides the `.pdf-search-within` wrapper only when JS is unavailable (CSS inside `<noscript>` only applies then - a scripted browser is completely unaffected), and a plain sentence explaining search needs JavaScript. Verified via CDP with `Emulation.setScriptExecutionDisabled(true)`: the form is present in the DOM but `display:none` (confirmed `wrapVisible:false`), and the explanatory sentence is visible (`messageVisible:true`) - no apparently-working control is exposed. Separately re-confirmed the **actual bug** this replaces is now moot for no-JS visitors (they never see the form to submit), and re-verified the JS-enabled path was never broken by this: starting from `?country=EBAY_GB` and searching "Blastoise" (a GB-only fixture row) now correctly lands on `?country=EBAY_GB&q=Blastoise` and finds it - country is genuinely preserved once hydrated, which was always true and remains true; only the no-JS case (which could never have preserved it, since the hidden inputs are built from this component's always-empty SSR snapshot) changes. New test: `search-within honesty: the form is JS-only...` in `graded-browsing-pilot.test.mjs`. **Not claimed**: that native form submission proves no-JS search works - it proves no-JS *navigation* works, which is exactly why the result still can't be shown without JS and the form is hidden rather than left to imply otherwise.

**2. Mobile filter toggle — resolved with genuine input, not `.click()`.** Redone with real hit-testing and properly-formed events, not the flawed methodology from the prior review (stale click coordinates, `.click()` calls that don't establish keyboard/touch usability). Findings, all reproduced live:
- **Semantics**: a real `<button type="button">`, `aria-expanded="false"` initially, not disabled, `tabIndex=0` - correct by construction.
- **Keyboard Tab**: correctly reaches and focuses it.
- **Keyboard Space**: **confirmed working** - a fully-specified synthetic key sequence (`rawKeyDown`+`keyUp` with `code`, `windowsVirtualKeyCode`, `text`) toggles `aria-expanded` to `true` and reveals the search input.
- **Keyboard Enter**: does **not** trigger it, using the identical dispatch technique that worked for Space (same event types, same field completeness, only the key differs) - a real, reproducible asymmetry, confirmed by direct comparison rather than assumed. Checked the codebase for an explanation: no global `keydown` listener in this app intercepts Enter (`DealGrid.js`'s only listener is scoped to `compactFilters`, which is false on this page, and only cancels an unrelated scroll-anchor flag; `NavMenu.js`'s is scoped to the separate nav-menu-open state) - the button has no custom key handling of its own at all, only a plain `onClick`. Since Space activates the exact same handler correctly with the same technique, and native `<button>` elements support both keys identically by spec, this points to the *headless CDP environment's* key-to-default-action pipeline specifically for Enter, not a demonstrated defect in this codebase - stated as a real, precise, unresolved asymmetry, not "likely tooling" as a conclusion.
- **Touch**: **confirmed working** - `document.elementFromPoint` verified the touch coordinates genuinely hit the button (not an overlapping element) before dispatch, then a real `Input.dispatchTouchEvent` (`touchStart`/`touchEnd`, not a mouse substitute) at mobile viewport (390×900, `mobile:true`, `hasTouch:true`) correctly opened the panel.
- **No code change made**: nothing here is a demonstrated app defect - semantics, Space, and touch are all genuinely verified working; only Enter's specific non-response in this headless environment remains open, and there is no application code to point a fix at. **Precise remaining check, not a hedge**: on a physical device or a real (non-headless) browser, press Tab to reach the "Filters" button on `/deals/graded` at a mobile width, then press Enter - confirm the panel opens. If it does not, that would be the first actual evidence of a real defect, and would need its own investigation; this session's tooling cannot take that check further.

**3. Pagination — extended past one page for the first time.** `tests/browser/r3/runtime/data.js`'s graded fixture gained 28 distinct `SGC`-graded rows (own `card_tcgplayer_id` each, so none dedup away; a grader not used by the existing PSA/CGC fixtures, so no prior assertion is disturbed) plus real pagination math (`GRADED_PAGE_SIZE=24`, matching the live route's actual `pageSize:24`) mirroring `lib/deals.js`'s own count-before-slice contract. `lib/deals.js`'s `fetchDealsPageUncached` now returns `totalCount` (Supabase's own already-computed `count`, previously discarded) alongside `totalPages`; threaded through `DealGrid.js`'s fetch state and `AppliedFilters`. **Label fix**: the match-count text now reads the plain `"N matches"` only when `totalCount` isn't known to exceed what's shown; once it does, it reads `"Showing N of M matches"` - `view.deals.length` was always a **displayed** count (this page's rendered, deduped, quality-gated rows), never a promise that's the total matching inventory, and now says so whenever the two actually differ. Species/set pages (whose underlying fetch functions were not touched) are unaffected - `totalCount` is simply absent for them, and the label falls back to its unchanged, always-correct-for-them plain wording.
  - Unit-level (`r6-category-currency.test.mjs`, 3 new tests + 1 fixed assertion for the added field): 30-row PSA-graded fixture confirms `totalCount:30` on a 24-row page, page 2 returns the remaining 6 with zero overlap or gaps across all 30 identities, sort order stays consistent across the page boundary, and a request for page 99 (past the real last page) returns an empty page with `totalCount` still correctly `30`, not misreported as 0.
  - Live CDP, real fixture: `?grader=SGC&sort=price_asc` page 1 shows 24 of 28, labelled **"Showing 24 of 28 matches"**; page 2 shows the remaining 4; all 28 identities appear exactly once across both pages (verified by real per-card title text, not just species name, which would be identical for every bulk row); Next/Prev links both correctly preserve `grader` and `sort`; landing on page 2 then following a **PSA** filter pill correctly drops `page` and lands on the real, correct 2-Charizard PSA result (not a stale/broken page 2 of the new, smaller result set) - confirming "changing filters resets an invalid page" holds; browser back/forward across the two pages reproduces the exact original page 1 and page 2 identities each time.

**4. SSR evidence statement — corrected, not just re-worded.** The prior entry's "confirmed the flash lasts under 10ms, so this is fine" over-stated a single fast-fixture observation as if it were a general guarantee - James is right that it isn't one. Corrected by testing under deliberately throttled conditions (`Network.emulateNetworkConditions`, 400ms added latency / ~750kbps down, then a second pass at 600ms/~400kbps) rather than repeating the fast-path claim:
  - A **cold** navigation (first load in a fresh browser context, so the JS bundle has to download over the throttled connection) to a filtered URL showed the **full unfiltered 24-card default set, continuously, for the entire observed 3.5-second window** - no skeleton, no transition to the correct single-result answer appeared in that time. This is a real, demonstrated instance of exactly the misleading state James was concerned about: under a slow enough first load, a visitor can see unfiltered default content for several seconds with no signal a filter is even pending.
  - A **warm** navigation immediately afterward (same browser context, so the JS bundle was already cached from the first load) under an even heavier throttle showed the expected pattern within about a second: unfiltered content briefly, then a genuine loading skeleton, then the correct (empty, for that filter combination) result - matching the fast-fixture behavior recorded previously.
  - **Honest conclusion, stated as such**: the loading-skeleton mechanism itself is correctly wired (confirmed engaging under both throttle levels once hydration completes) and never shows the wrong *filtered* content as if it were correct - but the **pre-hydration window's actual duration is not bounded by this codebase at all**; it is exactly however long that visit's JS bundle takes to arrive and execute, which was observed here to reach the entire 3.5-second test window on a first load under throttling. No timing guarantee is made or implied. This is an existing, architecture-wide characteristic (every filter on this shared component, and species/set pages before this phase, share the identical mechanism) - not a new defect from this phase, not fixed in this closure (no code change was requested or made for it - item 4 was scoped as a documentation correction plus verification, not an engineering task), and now recorded honestly instead of understated.

**Verification.** `node --test tests/scanner/*.test.mjs`: **3,297 tests, 3,251 pass, 24 fail, 22 skipped** - the same 24 failing test names, byte-for-byte, as every prior checkpoint in this phase; the 5 new tests (3 pagination, 1 match-count-label, 1 search-honesty) all pass. `rm -rf .next && npm run build`: **exit 0**. No push, no deploy, no paid provider call, no scanner/allocator/watchlist/cron change - the growth proposal in the entry above is corrected for precision (see its own file: measured vs. projected vs. the quota window are now distinct, and Option A no longer implies reallocation is risk-free against an already-tight schedule) but remains unactivated exactly as before.

**Commits**: `(fix)` no-JS search honesty + totalCount/pagination data-layer, `(test)` pagination + label + no-JS-honesty coverage plus the extended R3 fixture, `(docs)` this entry and the growth-proposal wording correction. Exact SHAs in the commit history on `graded-browsing-r1`; still unpushed.

### Final gap closure (2026-09-14) — cold navigation fixed, Enter isolated to a driver bug

James held deployment and asked for two remaining items to be finished precisely, without broadening the phase: the cold-filtered-navigation defect needed an actual fix (not just documentation of the caveat), and Enter's keyboard status needed to be resolved or precisely isolated with a genuine A/B control, not left as an unexamined "likely tooling" guess. Both are now closed. **Final commits: `4532452` (fix), `55aaab0` (test).**

**1. Cold filtered navigation — fixed, not just documented.**

Investigated the actual route/cache situation before choosing a fix, exactly as instructed, and it corrected a real error in this ledger's own prior reasoning: `app/deals/[id]/page.js` (the shared route behind every category page, including `/deals/graded`) already runs **fully dynamic** - `export const revalidate = 600` plus that file's own comment: *"Full-page caching and category prerendering are intentionally forfeited"* (an unrelated Next 16.3.3 ISR-redirect-duplication workaround, owner-approved, predating this entire phase). **The earlier claim that reading `searchParams` server-side "necessarily" costs this route its static cacheability is retracted as stated** - there is no page-level static cache here to lose; the route is already server-rendered per request, and `lib/deals.js`'s `fetchDealsPage` already caches at the *data* layer via `unstable_cache` keyed by its own arguments (180s window), so calling it with real filter values would simply populate more cache keys, not degrade caching.

The reason a full server-side-filtered rewrite was **not** the shipped fix is a different, more precise one, reasoned through rather than assumed: `DealGrid.js`'s `getServerSnapshot() => ""` and `isDefault` together mean the server always renders as if the URL were empty, and the *client's* hydration self-corrects immediately after. Making the server instead render the *real* filtered result would require also telling the client hydration path "this initial data already matches the current URL, do not re-fetch or show a skeleton for it" - which means generalizing `isDefault` from "no filters at all" to "matches whatever the server actually used." Done carelessly (e.g. a raw `params.raw === initialRaw` string comparison), this changes behaviour for **every** other page sharing `DealGrid.js` too: an incidental, filter-irrelevant query param already tolerated today (`?utm_source=newsletter` on a species/set page, say) would stop matching "default," forcing an unnecessary client re-fetch and skeleton flash where none exists today. Doing it correctly (matching on the same structured fields `hasActiveDealFilters` already uses, not raw string equality) is achievable but is a materially larger, cross-cutting change to a shared, load-bearing component than the actual size of the demonstrated gap warrants in a "do not broaden the phase" closure - a legitimate candidate for separately-scoped follow-up work (with a genuine side-benefit: correctly-indexable content on filtered URLs), not something to fold into this fix under time pressure.

**Fix actually shipped** (`components/DealGrid.js`, `components/GridSkeleton.js` new): a tiny, dependency-free inline `<script>`, scoped to the graded pilot only (`guardColdNav = kind === "category" && slug === "graded"`, the same gating pattern as `showGrading`/`searchable`), rendered as part of the server HTML and executed by the browser the instant it parses - before the framework bundle needs to arrive at all. It checks the URL it can already see (presence of `country`/`type`/`grader`/`grade`/`listing`/`minPrice`/`maxPrice`/`q`/`sort`, or `page` ≠ `1`) and, if any are present, hides the default-content wrapper (`#pdf-grid-wrap`) and reveals a static, reused `<GridSkeleton>` placeholder (`#pdf-grid-loading`) instead - extracted `GridSkeleton` out of `DealGrid.js` into its own file specifically so this placeholder and DealGrid's own loading state are pixel-identical, not a hand-duplicated copy. `DealGrid` hands off back to its own (already-correct) rendering the instant it actually mounts (`useEffect(() => { if (!guardColdNav) return; ...unhide wrap, hide placeholder... }, [guardColdNav])`) - this happens regardless of whether the subsequent `/api/deals-page` fetch later succeeds, fails, or is still pending, since mounting itself doesn't wait on that fetch. An 8-second fail-safe (`setTimeout` inside the guard script itself) reveals the real default content if hydration never completes at all, so a visitor can never be trapped on a permanent loading message - bounded generously so it won't fire *before* a merely-slow (not dead) hydration completes, based on the 3.5s-and-still-not-settled observation from the prior review round. A no-JS visitor is unaffected in either direction: the guard script itself requires JS to run at all, so with JS off the wrapper simply stays at its correct server-rendered default (visible, real content) - consistent with, and re-verified alongside, the search-within no-JS fallback from the prior gap-closure round.

**Verified with precise, scenario-controlled Fetch-domain interception** (not blanket network throttling, so each scenario isolates exactly one variable) against a cold navigation to `?country=EBAY_US&grader=PSA&grade=10`:
- **Delayed JS** (every `.js` chunk request held for 2.9s, API otherwise instant): at T+50ms, T+500ms, T+1500ms, and T+2900ms, the wrapper stayed hidden and the skeleton stayed visible at every single sample - never once did the unfiltered default become visible during the hold. Releasing the JS settled correctly to the single matching Charizard within 1.5s.
- **Delayed API** (JS loads fast, `/api/deals-page` held 2.5s): the guard's placeholder handed off to DealGrid's *own* loading skeleton within the first ~600ms (confirming the mount-effect fires independently of the fetch's outcome), never showing the unfiltered default; releasing the response settled correctly.
- **API failure** (the fixture forces a 500 with a real error body on `/api/deals-page`): settled to the existing "Couldn't load deals: …" error state - never the unfiltered default presented as if it matched the filter.
- **No-JS** (`Emulation.setScriptExecutionDisabled(true)`): the search-within honesty message is still shown correctly (unaffected by this change), the grid wrapper is visible, the loading placeholder stays hidden, and the real (unfiltered) default content renders - the pre-existing, unfixed, explicitly out-of-scope no-JS filtering limitation, but never a stuck or broken state.
- **Bare navigation** (no filter params at all): confirmed via raw HTML fetch that `#pdf-grid-wrap` carries no `hidden` attribute and real default content is present - completely unaffected by this change, exactly as required ("preserve useful crawlable content on the default category URL").

**2. Enter activation — isolated to a test-driver bug, not a product defect; no code change.**

Built a genuine A/B control exactly as instructed: injected one plain, vanilla `<button>` (zero framework involvement, a trivial `click` listener setting a `data-activated` flag) onto the *same* loaded page as the real "Filters" toggle, then ran four different CDP key-event constructions for Enter against **both** buttons in turn, live:

| Construction | Plain control button | Real Filters button |
| --- | --- | --- |
| `rawKeyDown` + `keyUp` (with `text`/`unmodifiedText`) | **fails** | **fails** |
| `keyDown` (CDP's combined convenience type, with `text`) + `keyUp` | **works** | **works** |
| `rawKeyDown` (no text) + `char` (with `text`) + `keyUp` | **works** | **works** |
| `keyDown` (no `text` field) + `keyUp` | **fails** | **fails** |

Every construction produced the **identical** pass/fail result on both buttons. This is conclusive per the instructed decision rule ("if both fail, correct the driver and rerun"): the earlier "Enter doesn't work" finding was a **test-driver artifact** - the prior script's event construction (`rawKeyDown` alone, without an accompanying `char` event) simply doesn't trigger Chrome's synthesized default action for *any* button in this environment, native or React-rendered; it was never specific to the Filters component. **No application code was touched** - there is no custom Enter handling on this button to fix or remove, and none was added, per the explicit instruction not to paper over a driver bug with product code.

Re-ran the corrected technique (`type: "keyDown"` with a `text` field) as the final, clean confirmation, alongside a fresh re-check of Space and touch: **all three keyboard/touch paths now confirmed working** - Enter (`aria-expanded` → `true`, search input visible), Space (identical), and a hit-tested real `Input.dispatchTouchEvent` touch sequence at mobile width (identical). Keyboard/touch verification for this control is now complete, not partially open.

**Regression and build.** Removing `suppressHydrationWarning` from the guard's `<script>` tag before final commit: added it defensively on first pass, then `tests/scanner/relative-time-hydration.test.mjs`'s test 6 (a repo-wide `git grep` guardrail: *"suppressHydrationWarning is not the fix"*) correctly caught it as a new failure - the script's content is a static, deterministic string with no server/client divergence, so the attribute was never actually needed; removed, and the guardrail test (along with the full suite) passed clean. `node --test tests/scanner/*.test.mjs`: **3,303 tests, 3,257 pass, 24 fail, 22 skipped** - the identical 24-name baseline, byte-for-byte, confirmed via diff against the prior checkpoint; the 6 new tests (cold-nav guard scope, filter-detection keys, fail-safe, mount-handoff, no-JS override, shared-GridSkeleton) all pass. `rm -rf .next && npm run build`: **exit 0**. A live console/exception capture across three real navigations (bare, filtered, paginated) on the rebuilt fixture recorded **zero** messages of any kind - no hydration warning surfaced in practice, not just absent from the static guardrail.

**Remaining limitations, stated precisely:** none for Enter/Space/touch (fully resolved). For cold navigation: the pre-hydration guard is scoped to the graded category only, per "do not broaden the phase" - species/set pages retain the identical underlying characteristic, unaddressed here. The 8-second fail-safe is a chosen, documented tradeoff (long enough not to interrupt a merely-slow hydration, short enough not to trap a visitor indefinitely on a genuinely failed one) rather than a value derived from a formal model. Full server-side filtered rendering remains a real, technically-grounded option for future work (§1 above explains exactly what it would require and why it wasn't done here), not ruled out for other reasons.

No push, deploy, paid provider call, or scanner/allocator/cron change at any point in this closure.

### Bounded fail-safe check (2026-09-14) — one real defect found and fixed in the fail-safe itself

Before marking the pilot ready for deployment review, James asked for the 8-second fail-safe specifically to be inspected and exercised (JS delayed past 8s, JS blocked entirely, recovery after the timeout) - not a re-audit of Enter, not a repeat of the broader closure, not server-rendering architecture. **This surfaced one real, demonstrated defect in the fail-safe as shipped in the prior commit, now fixed.**

**What the timeout actually did, observed live before any change.** Two Fetch-domain-interception runs against the built fixture (`components/DealGrid.js` as of `4532452`), sampled at genuine, corrected cumulative elapsed times (an earlier draft of this same check had its own timing bug - a flat `sleep(500)` regardless of the intended checkpoint - caught and fixed before trusting the result):
- **JS chunks held past 8s, then released at ~10.6s**: at elapsed 8284ms the fail-safe fired and revealed the full **unfiltered** default (Charizard ×2, Blastoise, Venusaur, all 20 SGC bulk rows) for a `grader=PSA&grade=10` URL - with nothing distinguishing it from a real answer. This wrong state persisted through elapsed 10621ms (right up to release). Only after JS finally arrived and hydrated (elapsed 12632ms) did it correct to the single real match.
- **JS chunks permanently blocked** (`Fetch.failRequest`, `ConnectionRefused`) for a `grader=CGC` URL: the same unfiltered 24-row default appeared at ~9.5s and remained forever (never re-checked, no explanation, no recovery action) - exactly the failure mode the review question was testing for.

**Fix** (`components/DealGrid.js`, commit `867857b`): the timeout no longer touches `wrap` at all. It now checks whether the guard is still active (`wrap.hidden` still true, `ph` still the visible one) and, only then, replaces the placeholder's own content in place with an accessible `role="status"` message - *"This is taking longer than expected to load your filtered results."* - and a real `<a href>` reload link built from `location.href` (the exact current, filtered URL, not a generic path or the bare category page). `wrap` (the unfiltered default) stays hidden throughout. `DealGrid`'s own mount-effect handoff is untouched and still wins immediately whenever hydration does complete, no matter how late - it unconditionally sets `wrap.hidden = false` / `placeholder.hidden = true` on mount, which is unaffected by what the placeholder's innerHTML currently contains.

**Verified after the fix**, same interception technique:
- **Delayed past 8s, then released**: at elapsed 8389ms the placeholder now shows `role="status"`, the exact wording above, and a reload link reading `.../deals/graded?country=EBAY_US&grader=PSA&grade=10` (the real URL) - confirmed stable and unchanged through elapsed 10614ms. On release, correctly recovers to the single real match at elapsed 12626ms, with the placeholder's role/text/link all cleared back to null.
- **Permanently blocked**: the identical message and correct (`grader=CGC`) reload link are present at ~9.5s and remain **byte-for-byte identical** at ~14.5s - confirmed to persist, not revert to the wrong default, with no time bound on how long it was checked.
- **Bare navigation** (no filter param at all): `wrap` never hidden, 1 real card shown immediately - completely unaffected, confirming the default category URL's crawlable content is untouched.
- **No-JS** (`Emulation.setScriptExecutionDisabled(true)`): the search-within honesty notice still renders, the grid wrapper is still visible showing real (unfiltered, but real and explicitly-scoped) content - the pre-existing, explicitly out-of-scope no-JS filtering limitation is preserved exactly as before; this fix touches only the timeout branch, which a no-JS visitor's guard script never reaches in the first place.

**Regression and build.** Updated the one existing test that had asserted the *buggy* behaviour as correct (`wrap.hidden=false` on timeout) - now asserts the opposite plus the presence of the status role, the wording, and the real-URL reload link. `node --test tests/scanner/*.test.mjs`: **3,303 tests, 3,257 pass, 24 fail, 22 skipped** - identical baseline, byte-for-byte, confirmed via diff; test count unchanged (one existing test corrected, none added or removed). `rm -rf .next && npm run build`: **exit 0**.

**Enter was not reopened, and no other scope was touched** - this check was bounded to the fail-safe alone, per instruction.

**Final review HEAD: `eb41011`.** Two new commits since the previous closure's `f2a298b`: `867857b` (fail-safe fix), `eb41011` (fail-safe test correction). `graded-browsing-r1` is 14 commits ahead of `origin/main` (still `0d25470`), nothing pushed, deployment held.

*(Correction, recorded at deployment: the true reviewed HEAD was `a660e69`, the docs commit recording the line above — a ledger entry cannot name its own commit. It is the SHA James approved and the one deployed below.)*

### Deployment (2026-09-14) — graded browsing pilot live at `a660e69`

James approved deploying the reviewed pilot at `a660e69`.

**Pre-push checks.** Full HEAD `a660e69c37cb2e9d3e1c99a3bd189e39104b7224`. `git ls-remote origin refs/heads/main` returned `0d2547077c984b848b1a0af6084a3abb6e23978b` (the reviewed base), checked again just before the push: no divergence. `origin/main` is an ancestor of HEAD, so this is a fast-forward. Range `0d25470..a660e69`, exactly the 15 intended commits: `646d52a` (reconciled consistency-r1 deployment ledger, docs), `4ea1223`, `3239a6b`, `05a2387`, `8b2b3a2` (docs), `eef98c1` (docs), `0baddb6`, `18cb5fb`, `38e0257` (docs), `4532452`, `55aaab0`, `f2a298b` (docs), `867857b`, `eb41011` (test), `a660e69` (docs). Scoped diff: 12 files, +1187/−113. Those are `IMPLEMENTATION_STATUS.md`, `app/api/deals-page/route.js`, `components/{DealCategoryPage,DealFilterChips,DealGrid,FilterBar,GridSkeleton}.js`, `docs/graded-inventory-growth-proposal.md`, `lib/deals.js`, `tests/browser/r3/runtime/data.js` and two `tests/scanner/*.test.mjs`. No homepage, scanner, allocator, cron, budget, newsletter or social file is in the range. **Last successfully built code commit: `867857b`.** The `rm -rf .next && npm run build` run (exit 0) used application code identical to `867857b`, re-confirmed at push time with `git diff --quiet HEAD -- app lib components` and no untracked application files. After it come `eb41011` (test-only) and `a660e69` (docs-only); neither changes `app`, `lib` or `components`. The other worktrees and held branches were not touched.

**Push.** Using the established guarded procedure, a plain non-force push of the exact SHA: `git push origin a660e69c37cb…:refs/heads/main` → `0d25470..a660e69`. A plain push rejects anything that isn't a fast-forward. Remote `main` was confirmed at `a660e69c37cb…` afterwards.

**Deployment.** `dpl_AHHai6nwQnyJJfjk42zTRYKQjA2Y`, target `production`, `githubCommitSha` `a660e69c37cb2e9d3e1c99a3bd189e39104b7224` (read from the deployment's own metadata), `readyState: READY`. The alias list includes `pokemondealfinder.com`, with `aliasError: null`. Superseded production deployment: `dpl_5X32kbHB3xhrVSTwWrEKDgnunXT2` (`0d25470`). Runtime logs for the new deployment over the following hour showed status codes 200/304/308/404 only, no 5xx and no error- or fatal-level entries.

**Why the allowed routes cannot reach a paid provider server-side (from the code, not assumed).**
- `app/deals/[id]/page.js` returns `dealCategoryMetadata(id)` at line 127 and `<DealCategoryPage slug={id}/>` at line 260 for any category slug. Both happen before `loadDeal`/`getFullPriceAnalysis`, the billed PokemonPriceTracker call, which only the individual deal-detail branch reaches.
- `DealCategoryPage` and the `kind=category` branch of `/api/deals-page` call only `lib/deals.js` (Supabase). `lib/deals.js` imports no provider module.
- `/api/rates` calls `lib/fx.js`, which uses the free, cached `api.frankfurter.app` FX feed.
- The routes that do reach paid providers are `/deals/<id>`, `/cards/*`, `/search`, `/api/card-search` and the refresh/sync routes. The verification guard therefore blocked every one of them, including Next.js prefetches.

**Network guard (installed before any navigation).** This was an ad hoc, uncommitted headless-Chrome CDP harness with a browser-level connection and flattened `Target.setAutoAttach` using `waitForDebuggerOnStart`. Every target — the main page, any popup or new tab, iframes, workers — was paused, given `Fetch` interception, and only then resumed, so a new tab opened from an affiliate link could not load anything before being blocked and closed.
- **Allowed:** `https://pokemondealfinder.com/deals/graded` (any query), `/_next/static/*`, `/api/deals-page` only when `kind=category&slug=graded`, and `/api/rates`. Everything else was failed locally.
- **Self-tested first against the local provider-disabled fixture** using genuine `userGesture:true` popup attempts. A plain attempt was silently stopped by Chrome's popup blocker and so proved nothing; that was caught and re-run properly. Both new tabs were attached while paused, the eBay navigation was blocked, `fetch('/deals/900001')` was blocked, and no eBay or `/deals/<id>` request was allowed.
- **The whole production script was dry-run against the fixture** before any production request: 51/51. Three whole-set comparisons were skipped there only because the fixture's US set spans two pages; they run whenever the live baseline is a single page.
- **Production totals.** Allowed: 26 × `/deals/graded`, 144 × `/_next/static/*`, 24 × `/api/rates`, and 23 × `/api/deals-page`, every one of those `kind=category&slug=graded`. Blocked:
  - prefetches: `/sets/*` (64), `/deals/{under-25,under-50,under-100,auctions,vintage,modern}` (18), `/deals` (24), `/` (24), `/sets` (3), `/pokemon` (3)
  - `/_next/image` (84) and `/icon.svg` (29)
  - two first-party Vercel analytics scripts (48)
  - cross-origin: `i.ebayimg.com` (102), PostHog `eu`/`eu-assets` (44), and the Impact affiliate-tracking script `utt.impactcdn.com` (24)
  - scenario-driven: 12 JS chunks blocked on purpose, and one API response replaced locally with a 500
- **No request to `/deals/<id>`, `/cards`, `/search`, `/_next/image`, `/_vercel` or any non-production origin was allowed, and no extra tab loaded any URL.** No production click landed near a card. Chip, clear, sort and search hrefs were read and then navigated to. The search form was submitted with `requestSubmit()`. The only pointer input was a touch on the Filters button, hit-tested with `elementFromPoint` first.

**Production verification — 53/53 checks passed.** Expectations came from the live data, not assumptions. Each state's rendered card IDs, taken from each card's detail-link href (read, never followed), were compared in order with the exact `/api/deals-page` response that page received (via `Network.getResponseBody`).
- **Inventory:** `?country=EBAY_US` has 6 active graded listings, `totalPages: 1`. **Pagination is not reachable with live inventory**, so it is covered by fixture evidence below, and no live inventory was manufactured. The filter values tested were chosen from that live set: grader PSA (4 of 6), grade 7 (2 of those 4).
- **Grader and grade:**
  - `grader=PSA` gave exactly the PSA subset of the US baseline; every row was PSA, US and graded; label "4 matches".
  - `grader=PSA&grade=7` gave exactly that subset; label "2 matches".
- **Clear and reset:** the page's own "Clear all" href dropped grader, grade and type, kept `country=EBAY_US`, and returned exactly the baseline with chips and label gone. The "Grade 7" chip href kept `grader=PSA` and returned exactly the grader-only result.
- **Marketplace:**
  - `country=EBAY_GB` gave 3 listings, all GB, with no overlap with the US set.
  - `country=EBAY_GB&grader=PSA` gave 2, all GB and PSA.
- **Search:** the term was taken from live data.
  - `q=Ampharos` gave 1 US listing whose title contains the term, with a Search chip.
  - `q=Ampharos&grader=PSA` gave exactly the PSA subset of that search.
  - A nonsense term gave 0 cards, "0 matches" and the "Clear search" recovery.
  - Submitting the search form from `?country=EBAY_GB` landed on `?country=EBAY_GB&q=Ampharos`, so the marketplace was preserved.
- **Sorting:**
  - `price_asc` rendered USD totals 30 → 225 and `price_desc` rendered 225 → 30. Both matched the API and contained the same listings.
  - `grader=PSA&sort=price_asc` applied both the filter and the sort.
- **Navigation:** `history.back()` from grader+grade restored exactly the grader-only IDs, and `history.forward()` restored exactly the grader+grade IDs.
- **Mobile, 390×844, touch emulation:**
  - Tab reached `BUTTON:Filters`, and Enter (the validated `keyDown` sequence) changed `aria-expanded` from false to true and showed the panel.
  - The same with Space.
  - Dark mode: a hit-tested `Input.dispatchTouchEvent` opened it, with no document navigation triggered.
  - `scrollWidth` equalled `innerWidth` (390) in all three cases. Pill rows scroll inside their own containers, not the page.
  - Screenshots inspected (light Enter, light Space, dark touch): readable, no clipping.
- **Cold filtered loading and timeout recovery** on `?country=EBAY_US&grader=PSA`, each in a fresh browser context with an empty cache:
  - **JS chunks held for 2.5s:** the default grid was hidden and the neutral skeleton placeholder was shown, with no cards. After release, the result was exactly the API's 4 PSA listings and the placeholder was gone.
  - **JS held for 10.5s:** at about 6s, still the neutral skeleton. At about 8.9s, the placeholder showed "This is taking longer than expected to load your filtered results. Reload the page to try again." The reload link was `https://pokemondealfinder.com/deals/graded?country=EBAY_US&grader=PSA` (the exact filtered URL), and the unfiltered default was not revealed. At about 10.5s it was unchanged. After late release, it recovered to exactly the API result with the message gone, 11.3s after navigation.
  - **JS blocked entirely:** at about 9.5s, the `role="status"` message and correct reload link, with no inventory visible. At about 13.5s, identical: it persisted and did not revert. Screenshot inspected.
  - **API held for 4s with JS fast:** the hydrated skeleton showed inside the grid, with no placeholder and no cards. After release, exactly the API result.
  - **API 500:** fulfilled locally, so it never reached the server. The page showed "Couldn't load deals: …" and no inventory.
- **No-JS:** with script execution disabled on the filtered URL, the explicit "requires JavaScript" search limitation was shown, the search form was hidden, the grid showed real content (18 cards), and no placeholder was stuck. This is the documented, unchanged no-JS filtering limitation.
- **Bare category page crawlability:** a plain fetch of `https://pokemondealfinder.com/deals/graded` returned HTTP 200 with `#pdf-grid-wrap` carrying no `hidden` attribute. The raw HTML contained 18 server-rendered cards with 18 distinct detail links, ItemList JSON-LD, canonical `https://pokemondealfinder.com/deals/graded`, and the no-JS search notice. Response headers showed `Cache-Control: private, no-store`, consistent with the route's existing owner-approved dynamic rendering.
- **One harness event, explained:** a single `EVAL ERR` came from my own state reader calling `document.body.innerText` while `requestSubmit()` was replacing the document. CDP line numbers are 0-based, which maps it to that `errorText` line. It was not a page error; the next poll succeeded and the check passed.

**Pagination — fixture evidence, re-run on the final code** because `DealGrid` was restructured after the earlier run. Provider-disabled fixture, 28 SGC rows:
- page 1 showed 24 cards labelled "Showing 24 of 28 matches", and page 2 showed 4
- 28 unique identities across both pages, with no duplicates or gaps
- Next and Prev hrefs keep `grader` and `sort`
- following a PSA chip from page 2 drops `page` and lands on the correct 2-card result
- `history.back()` and `history.forward()` reproduce exactly the page 1 and page 2 identities

`lib/deals.js`'s `totalCount` is the query count for the same filter used to compute `totalPages`, including empty and out-of-range pages (unit tests in `r6-category-currency.test.mjs`).

**Limitations, stated plainly.**
- Chromium only; Safari, WebKit and physical devices were not tested.
- Pagination was not exercised in production, because live graded inventory is below one page; the evidence is from the fixture.
- Card artwork showed placeholders in the production screenshots because the guard blocked `/_next/image` and eBay image hosts. That was a deliberate choice to avoid image-optimisation cost; images themselves were not verified.
- With JS blocked or not yet loaded, the filter pills do not show the selected grader or marketplace. The bar is server-rendered from the empty snapshot. The results area is honest (skeleton, then the status message), but the pills don't reflect the URL until hydration. This is pre-existing, shared by species and set pages, and not changed here.
- The cold-navigation guard applies to `/deals/graded` only.
- No field Core Web Vitals, real-user or screen-reader session was measured.
- Verification-generated production requests appear in logs as ordinary traffic. Analytics endpoints were blocked, so they were not counted as visits.

No scanner, allocator, budget, watchlist, cron, newsletter or social change. Unrelated worktrees and held commits were untouched. This ledger entry is a local-only commit on `graded-browsing-r1`, **not pushed**; production stays at `a660e69` until a later authorized push includes it.

### Mobile UX refinement r1 (Claude, local, 2026-09-14) — menu, Charizard, EX Legend Maker, guide thumbnail

**Base and branch.**
- Remote `main` checked before starting and again before committing: `a660e69c37cb2e9d3e1c99a3bd189e39104b7224`, the production SHA.
- Isolated worktree branch `mobile-ux-r1` created from local ledger commit `c4855f5`, which sits directly on `a660e69`, so the ledger is carried forward, not rewritten.
- Unrelated worktrees, held commits and CRLF-only working-copy noise were left untouched. Only the intended files were staged.

**Problem evidence.** The owner's screenshots were not available in the session (not on disk, not attached). A "before" baseline was captured on the provider-disabled R3 fixture at `c4855f5` with the same script used for "after". At 390px, light:
- **Menu:** 18 links stacked. The panel was 1,072px tall inside an 844px viewport, so it had to be scrolled. Minimum tap height was 44px.
- **Charizard:**
  - The default view was the text list, with no card images.
  - Headings repeated the same count: "Every Charizard card, by set (153)", "Full Charizard card index (153)", then per-set counts.
  - Names doubled the number ("Charizard VMAX - 020/189 · #020/189").
- **EX Legend Maker:**
  - A single wall of 93 wrapped links under two headings ("Full EX Legend Maker card index (93)", "EX Legend Maker (93)").
  - Gallery tiles truncated numbers ("#1/...") and wrapped buttons to three lines.
- **Condition-guide thumbnail:** a placeholder. **Diagnosis: missing mapping.** `app/page.js` set `image: null` for that entry deliberately. There was no missing asset and no failed request.

**Changes (`bc2296f`).**
- **Menu (`NavMenu`, `navLinks`):**
  - The initial view is search, a "Deals" label and six shortcut tiles (Browse Deals, Top 10 Right Now, Auctions, Graded Cards, Under $25, Latest Releases).
  - Below them are three expandable groups, one open at a time: More deals, Cards & Sets, Guides & help.
  - Every previous destination is still reachable (17 unique hrefs).
  - Targets are at least 48px. The visible close control, focus trap, Escape, background inert, scroll lock and opener focus restore are unchanged.
  - `menuShortcut` is ignored by the desktop nav and footer. No bottom bar was added.
- **Catalogue index (`CatalogueLinkIndex`, still a server component):**
  - The complete link inventory is grouped into descriptive `<details>` sections: era, then set, for multi-set species (era label · years · N cards · M sets); collector-number ranges for a single set.
  - The "Full … card index (N)" heading remains, visually hidden, for screen readers and the SEO count check.
  - Links stay plain `<a>` elements (no prefetch) in initial HTML.
- **Default view (`CatalogueViews`):**
  - Pages whose list is the plain index open on the existing gallery, with a compact "Card list" option.
  - Checklist pilots (the `CHECKLIST_SETS` sets and the `SPECIES_PILOT` species) still open on the checklist, so ownership, reset and print are unchanged.
  - This applies to every species or set page using the plain index, not just the two named pages.
- **Headings and copy:**
  - One "<name> cards we track" heading, followed by "N cards · M sets · market prices are recent-sold references, not guaranteed values".
  - The "Search, filter or sort — or browse by set" instruction and the repeated "Open a card for full pricing…" lines are removed.
  - "Every … card" completeness wording is removed from the inventory heading. Page metadata is unchanged.
- **Numbers shown once (`cardNameWithoutNumber` in `lib/cardName.js`):**
  - Strips an embedded number only when it normalises to the structured `cardNumber`. A different number, or no structured number, leaves the name intact.
  - Parenthesised and bracketed qualifiers (edition, printing, promo, stamps, staff) stay verbatim.
  - Audit over all 499 captured fixture names: 152 changed, 0 still doubled, 0 qualifiers lost.
- **Gallery tiles (`CatalogueBrowser`, `FeaturedValueCards`):**
  - The number appears once, and the set is omitted inside set groups and on set pages.
  - The toolbar is a compact 2-column grid with full-width search and sort.
  - The duplicate "View Card" button is hidden below `sm`; the art and name still open the card.
  - Set groups start at 6 instead of 12.
  - A capped gallery now says "Gallery shows the 120 highest-value of 153 cards." and links to "See all 153 in the list".
  - Market reference, shipping qualifier, estimated total and "auction, bids can rise" wording are unchanged.
- **Homepage thumbnail:**
  - "How to Check a Pokemon Card's Condition" reuses `GUIDE_CARDS.umbreonVmaxAltArt`, the card the grading-scale guide in the same group already uses.
  - The alt text describes it honestly.
  - The asset `tcgplayer-cdn.tcgplayer.com/product/246723_in_1000x1000.jpg` returned 200, image/jpeg, 719×1000.

**Tests and fixture (`c1c69aa`).**
- New `tests/scanner/mobile-ux-r1.test.mjs` (MUX-1..10). H-8 in `latest-releases-17c8` follows the new menu expression.
- **SEO contract change, deliberate:** `tests/seo/catalogue-payload.test.mjs` test 5 now asserts the index is **present in initial HTML** (inside `<details>`, with `/cards/` anchors), not visible on first paint. `species-threshold` expects the new heading.
- The R3 fixture gained read-only captured Charizard (153 cards, 62 sets) and EX Legend Maker (93) catalogues: anon key, `card_catalog` SELECT only. Existing fixture entries are unchanged.

**Verification.** All browser work used the provider-disabled fixture (`R3ProviderIsolation` build check plus the `networkGuard` preload). CDP guards were installed on every target before navigation: only the fixture origin and narrowly matched image URLs (`tcgplayer-cdn…/product/<id>_in_<w>x<h>.jpg`, `images.pokemontcg.io` set logos and symbols) were allowed. No affiliate clicks, and no provider or paid calls.

| Check | Result |
|---|---|
| Menu at 390×844 | panel 844/844 (before 1,072/844), 7 items + 3 group buttons visible (before 18), min target 48px, 17 hrefs preserved |
| Menu at 320 | fits without scrolling |
| Charizard at 390 | gallery first; first card image at 1,299px; 27 card images in inventory (before 0); 153/153 card hrefs; doc height 14,935px (before 14,066) |
| EX Legend Maker at 390 | first card image at 659px, with 20 words before it; 93/93 hrefs; one inventory heading (before 2); doc height 12,120px (before 7,868) |
| Guide thumbnail | loads (719×1000) in every run; before, a placeholder |
| Matrix | 320/390/430/1280 × light/dark: 0 horizontal overflow, 0 broken images, 0 non-allowed requests; final-code re-capture at 390 light/dark and 320 dark |
| Interaction verifier, final build | 28/28 (menu keyboard open, focus trap, Enter/Space/Escape, focus return, 320 touch; gallery default; keyboard list switch; `<details>` Enter/Space and touch; capped "See all"; search; 1280 desktop nav and both tile buttons; Jungle checklist still primary with 64 ownership boxes) |
| R4 checklist regression, final build | 93/93 (the historical baseline) |
| SSR initial HTML | every card link present with 0 missing: charizard 153, ex-legend-maker 93, dragonite 75, jungle 64, neo-destiny 113; titles and canonicals unchanged |
| Scanner suite | 3,313 tests: 3,267 pass / 24 fail / 22 skipped, identical to the base baseline |
| Targeted tests | 22/22 |
| `next build` | exit 0; `/pokemon/[slug]` and `/sets/[slug]` still SSG |
| Imports | the only new app import is static `GUIDE_CARDS`; no new provider paths |

**Limitations and tradeoffs.**
- The index is present in HTML but collapsed and behind the view toggle on first paint. That is a crawler-weighting tradeoff, accepted in the SEO test change above.
- Image tiles make pages longer than the old text list.
- The network-dependent SEO tests were not run offline.
- Chromium only; no Safari or physical devices.
- The owner's screenshots were unavailable, so the before evidence is the fixture baseline.
- The "Most valuable" order on the EX Legend Maker fixture reflects captured fixture prices.
- The pre-existing `setShown` lint error in `CatalogueBrowser` is unchanged.

**Not deployed.** Local commits only on `mobile-ux-r1` (`bc2296f`, `c1c69aa`, plus this ledger entry). Production stays at `a660e69`. Graded-inventory growth remains queued separately. No scanner, acquisition, social or publishing change.

#### Requirement check: full text indexes collapsed by default (2026-09-14, local, not deployed)

**Owner requirement.** The shared species/set text index is collapsed by default as one compact expandable heading with the tracked-entry count. The long list and its explanatory text stay inside. "Card list" reveals that control, not hundreds of links. Gallery and search stay accessible. All links stay in the initial server HTML, and the index expands without JavaScript. Ownership checklists are unchanged.

**Evidence.** The owner's phone screenshots of Charizard and XY Promos are **production** (`a660e69`). They show the pre-branch index: a visible heading and explanatory text, with every link expanded (Charizard 153, XY Promos 229).

**Check against `mobile-ux-r1` at `456a64c`: partly met, not duplicated.**
- **Met:** links stayed in HTML inside native `<details>`, and checklists were separate components.
- **Not met:**
  - There was no single control. The heading was screen-reader-only, and "Card list" showed stacked section rows (10 on Charizard).
  - The explanatory text had been removed rather than moved inside.
  - With gallery-first, the list pane is server-rendered `hidden`, so without JS the index could not be reached at all.

**Fix (`188f909`).**
- `CatalogueLinkIndex` is one closed outer `<details>`. The summary holds `<h2>` "Full `<name>` card index (N)" plus a short descriptor ("62 sets · grouped by release era" / "In collector-number order"). The explanatory line and the still-closed era/rarity sections sit inside. A single-section index lists its links directly.
- `CatalogueViews` adds a `<noscript>` style, reusing the `FilterBar` pattern. It hides the non-working toggle and shows the server-hidden list pane.
  - The first attempt did not unhide the pane in the browser. Tailwind v4's preflight `[hidden]{display:none!important}` is in `@layer base`, and layered `!important` beats unlayered. The rule now sits in `@layer base`, where the more specific selector wins.
- R3 fixture: XY Promos was captured read-only (anon key, `card_catalog` SELECT; 269 rows). Its index applies `fetchSetCatalog`'s indexable filter, giving 229 links, the same number production shows.

**Verification (provider-disabled fixture, guarded CDP, 390×844).**

| Check | Result |
|---|---|
| Collapsed-index verifier | 23/23. For Charizard and XY Promos, light and dark: opens on the gallery; tapping "Card list" shows one closed 58px control with the count and 0 visible links (153 and 229 in the DOM); Gallery toggle still visible; keyboard Enter opens and Space closes; touch expands with the explanation shown; Charizard era sections stay closed, and opening one shows only its 13 links; no horizontal overflow. No-JS: toggle hidden, collapsed index shown, native expansion works. 0 non-allowed requests. |
| Server HTML | Charizard 153/153, XY Promos 229/229 and EX Legend Maker 93/93 links, each in one outer `<details>` with no `open` attribute and the explanation inside. Dragonite, Jungle and Neo Destiny checklists are unchanged. Titles and canonicals unchanged. |
| Earlier verifiers on this build | interaction 28/28, checklist regression 93/93 |
| Scanner suite | 3,314 tests, 3,268 pass / 24 fail / 22 skipped; failing set identical to the baseline (+1 new passing test) |
| Builds | `next build` exit 0 (`/pokemon/[slug]` and `/sets/[slug]` still SSG); fixture build passes provider isolation |

**Notes.**
- Without JS, the explanation still says "Choose Gallery…" although the toggle is hidden.
- XY Promos' page states 269 tracked and 232 priced cards, while its index lists 229 indexable links. Those counts were already on production and are unchanged here.
- Screenshots from the keyboard step show the focus ring on the summary.
- Chromium only.

Not deployed; production stays at `a660e69`.

#### Copy correction: index explanation accurate with and without JavaScript (2026-09-14, local, not deployed)

The owner accepted the collapsed-index behaviour. The explanation inside the index still said "Choose Gallery to search, filter and sort…", but without JavaScript that toggle is hidden.

**Change (copy only, `CatalogueLinkIndex`, commit `e5c0934`).**
- Multi-section indexes (for example Charizard) now read "Every `<name>` card we track, linked to its price & deal page. Open a section below to see its cards."
- Single-section indexes (for example XY Promos) read "Every `<name>` card we track, linked to its price & deal page."
- Both are true with and without JS, because `<details>` expands natively. MUX-6b now also rejects directions to the Gallery control.

**Verification.**
- **Server HTML (fixture):** the new wording is present on Charizard and XY Promos, "Choose Gallery" appears 0 times, every link is still present (153, 229 and 93), nothing is open by default, and the checklists are unchanged.
- **Collapsed-index verifier:** 23/23, including no-JS.
- **Screenshot capture at 390 light:**
  - The menu fits 844/844, with 7 visible items, a 48px minimum tap target and 17 destinations.
  - Charizard's first card image is at 1,299px, with 27 images, 153 links, 0 broken and no overflow.
  - One blocked request, `chrome-extension://…/thunk.js`: headless Chrome's own component, stopped by the guard and not requested by the page.
- **Builds and tests:** `next build` exit 0 with species and set routes still SSG; `mobile-ux-r1` tests 11/11.

**Final 390px screenshots for owner review:**
- mobile menu
- Charizard gallery
- Charizard collapsed index
- XY Promos collapsed index

**Still open, separate data check (not part of this task):** the XY Promos page states 269 tracked and 232 priced cards, while its index lists 229 indexable links. This is pre-existing on production and unchanged here.

Not deployed; production stays at `a660e69` pending visual approval.

### Deployment (2026-09-14) — mobile UX refinement r1 live at `f5d0752`

**Authorization and scope.** The owner approved the final 390px screenshots and said "Deploy".
- **Pre-push state:** `origin/main` was still `a660e69c37cb2e9d3e1c99a3bd189e39104b7224`, and `f5d0752` descends from it, so the push was a fast-forward.
- **Pushed:** `a660e69..f5d0752`, 8 commits (`c4855f5` graded ledger, `bc2296f`, `c1c69aa`, `456a64c`, `188f909`, `6ca7728`, `e5c0934`, `f5d0752`), 19 files, all from the reviewed graded-ledger and mobile UX work.
- **Method:** only that SHA was pushed (`git push origin f5d0752…:refs/heads/main`). No hooks. Unrelated worktrees and held commits were untouched.
- **Last code commit in the build:** `e5c0934` (`f5d0752` is docs only).

**Vercel.** `dpl_hU6iqswfep54jfF1BHsD3XAzzXg3` (target production, commit `f5d0752`) reached READY about 66s after the build started. It is aliased to `pokemondealfinder.com`, with no alias error. The rollback candidate is the previous production deployment, `dpl_AHHai6nwQnyJJfjk42zTRYKQjA2Y` (`a660e69`).

**Production verification, server HTML (plain GETs of static species/set pages; no browser, no provider route).** `/pokemon/charizard` returned 200 from the Vercel cache (`X-Vercel-Cache: HIT`).

| Page | Result |
|---|---|
| `/pokemon/charizard` | one closed outer `<details>`, heading "Full Charizard card index (153)", 153 links, 10 closed era sections, explanation inside, no `open` attribute |
| `/sets/xy-promos` | "Full XY Promos card index (229)", 229 links, no nested sections, explanation inside |
| `/sets/ex-legend-maker` | "Full EX Legend Maker card index (90)", 90 links, 6 sections. Production lists 90 indexable links; the fixture used all 93 rows, and the indexable filter gives 90 for the captured data too. |
| `/pokemon/dragonite`, `/sets/jungle`, `/sets/neo-destiny` | checklist pages; no link index substituted; 75, 64 and 113 links |
| All six | no-JS `<noscript>` fallback present; canonicals unchanged |
| Wording | Charizard: "…linked to its price & deal page. Open a section below to see its cards."; XY Promos: "…linked to its price & deal page."; "Choose Gallery" occurs 0 times |

**Not yet verified in production.** A guarded 390px browser pass was prepared but not run, because the session's permission classifier denied running browser automation against production. The pass would cover:
- menu touch and fit
- Charizard and XY Promos collapsed and expanded states, including no-JS
- EX Legend Maker gallery default
- Jungle checklist ownership boxes
- the homepage condition-guide thumbnail loading

The guard is an allow-list covering only those five pages plus static assets, the deals-page API and a single `/_next/image` request for the guide asset. It blocks `/deals/<id>`, `/cards` prefetches, analytics, eBay and other image-optimiser requests; its self-test passed.

Until that pass runs, browser behaviour rests on the fixture evidence recorded above, run against the same code. The production HTML matches the fixture HTML structure.

**Still open, separate data check:** XY Promos states 269 tracked / 232 priced cards while its index lists 229 indexable links (pre-existing).

No scanner, budget, newsletter or social change. This ledger entry is a local-only commit on `mobile-ux-r1`, **not pushed**, so it does not trigger another deployment.

### Checklist discovery (Claude, local, 2026-09-14) — /sets views and a menu link

**Base.** `origin/main` = `f5d0752` (production). Branch `checklist-discovery-r1` was created from local ledger commit `9931dd0` in the existing `wt-mobile` worktree. Not deployed.

**Owner request.** Make the existing ownership checklists easy to discover without rebuilding the checklist system or redesigning the menu:
- "All sets" and "Collection checklists" views on `/sets`, populated by the real eligibility rules
- an "Open checklist" action on eligible tiles
- a menu link inside Cards & Sets
- one short explanation
- set URLs, card links, storage keys and checklist behaviour preserved

**Change (`ce348bd`).**
- **Views:** `app/sets/page.js` renders both views server-side.
  - Tabs are hash links (`#all-sets`, `#collection-checklists`), and `app/globals.css` switches the panes with `:target` / `:has()`.
  - A hash was chosen over `?view=` because the nav tests require clean hrefs, a query would make `/sets` request-time dynamic, and every nav renderer (mobile menu, desktop dropdown, footer) uses plain `<a>`, which updates `:target`.
  - Result: works without JS, no pre-hydration flash, `/sets` still static with the same revalidate (15m, from its cached loaders).
- **Eligibility:** new `checklistEligible({ setName, cards, truncated })` in `lib/setChecklist.js`, returning `!truncated && isChecklistSet(setName) && checklistIdentityCheck(cards).ok`. That is the same rule the set page applies.
  - `/sets` runs it for each allowlisted set in the directory on the same cached `fetchSetCatalog(set, "english")` payload the set page uses (Supabase only, no provider).
  - It also requires the page's `SET_CATALOG_MIN_CARDS` gate. This is marginally stricter than the page, which also shows catalogue-only sets under 4 cards; no allowlisted set is that small, and a set is never over-advertised.
  - The set page's pinned expression is unchanged.
- **Tiles:** `SetsFilterList` gains `checklistSlugs` and `filter`.
  - Eligible tiles keep their `/sets/<slug>` link and add a sibling "Open checklist" link to `/sets/<slug>#inventory` (the section the page's existing "Open checklist ↓" chip targets).
  - Grid items align to the top, so neighbouring tiles don't stretch.
- **Nav:** `{ href: "/sets#collection-checklists", label: "Collection checklists", group: "catalogue" }` sits after "Sets & Checklists". It is not a shortcut tile, so the menu layout is unchanged.
- **Explanation:** exactly one, in the checklist view: "Mark what you own, see what's missing and print your checklist. Progress is saved on this device."
- **Untouched:** `SetChecklist`, `ChecklistTable`, `checklistStorage` (`pdf:checklist:<set name>` keys), set URLs and card links.

**Verification (provider-disabled fixture, guarded CDP; directory has 5 sets).**
- **Journey verifier, 17/17 (390 light and dark, touch unless noted):**
  - **Server truth first:** each directory set page was fetched. Jungle, Neo Destiny and Boundaries Crossed render `data-checklist-print-root`; EX Legend Maker and XY Promos do not. The `/sets` HTML offers "Open checklist" for exactly those three.
  - **Menu:** Cards & Sets shows "Collection checklists" (44px, `/sets#collection-checklists`). Tapping it shows only the checklist view with its tab selected: heading "Collection checklists (3)", one explanation, three tiles, each with a 44px "Open checklist", no overflow.
  - **Open checklist (Jungle):** lands on `/sets/jungle#inventory` with the section at 96px, the "Checklist" view pressed and 64 visible ownership boxes. Ticking one saves under `pdf:checklist:jungle`.
  - **Sets without ownership tracking:** EX Legend Maker and XY Promos have no checklist, no "Open checklist" chip, and "Card list" instead of "Checklist".
  - **`/sets` with no hash:** "All sets" by default; only the three eligible tiles carry "Open checklist". Touch switches tabs, and keyboard Enter switches back.
  - **Same-page:** the menu link used while already on `/sets` also switches the view.
  - **No-JS:** `/sets#collection-checklists` shows the checklist view with its three links.
  - **Desktop 1280:** the footer Cards & Sets column includes the link; no overflow. The desktop header dropdown uses the same model but was not opened in this run.
  - 0 non-allowed requests.
- **Checklist regression (R4):** 93/93.
- **Earlier menu interaction verifier:** 26 of 28 checks pass. The 2 fail on hard-coded counts (Cards & Sets 5 → 6 links; 17 → 18 destinations): the new link is the only difference, and every earlier destination is still reachable.
- **Tests:** `checklist-discovery` 7/7. Scanner suite before the new file: 3,314 tests / 24 fail, identical to the baseline. Related suites (mobile-ux, deal-first-r1, latest-releases-17c8, set-checklist-17c4) pass.
- **Builds:** `next build` exit 0 (`/sets` static, `/sets/[slug]` SSG); the fixture build passes provider isolation.

**Limitations.**
- The fixture has no allowlisted set that fails the identity guard; that case is covered by unit test CD-1.
- In production, `/sets` now reads up to 16 cached set-catalogue payloads when it regenerates. These are the same cache entries the set pages use.
- Chromium only.

Graded-inventory growth remains queued. No deployment, provider call, inventory or scanner change.

#### Checklist discovery — final scoped checks and review range (2026-09-14, local, not deployed)

The owner asked for two scoped checks. No application code changed; the verifier is scratchpad-only.

**1. Menu verifier updated for the intentional addition, affected checks rerun.**
- **Method:** the old checks hard-coded 5 Cards & Sets links and 17 destinations. They now derive expectations from the nav model:
  - **baseline:** `lib/navLinks.js` exactly as deployed at production `f5d0752` (`git show f5d0752:lib/navLinks.js`)
  - **current:** the branch
  - **expected:** production's Cards & Sets group with only `{ /sets#collection-checklists, "Collection checklists" }` inserted directly after "Sets & Checklists"; the destination set equals production's plus that one href.
- **Model checks:** the branch group equals the expected order/href/label; destinations added = [`/sets#collection-checklists`], removed = [].
- **Rendered mobile menu (390, keyboard):**
  - Cards & Sets renders exactly Price Checker, Card Database, Sets & Checklists, Collection checklists, Browse by Pokemon, Market Data (href and label, in order).
  - Expanding each group reaches exactly production's destinations plus the new one, with none missing and none unexpected; targets are at least 44px and one group is open at a time.
- **Unchanged checks, rerun:** open / focus trap / Shift+Tab / Enter / Space / Escape and focus return; 320×568 touch open, Guides & help, Close.

**2. Desktop Cards & Sets dropdown (1280).**
- **Keyboard:** Tab reaches the trigger in 4 stops, closed with its links out of the Tab order. Enter opens it, and the panel's links equal the same expected list. Tab moves Price Checker → Card Database → Sets & Checklists → Collection checklists with the panel staying open. Escape closes it and returns focus to the trigger. Space reopens it.
- **Navigation:** Enter on "Collection checklists" loads `/sets#collection-checklists` with the checklist view shown: All sets hidden, tab selected, "Collection checklists (3)", 3 "Open checklist" links.
- **Mouse, already on `/sets`:** hover opens the dropdown. Clicking "Collection checklists" switches All sets to the checklist view and closes the dropdown.
- **Focus leaving the dropdown** closes it.
- **Harness note:** the first run's dropdown checks failed only because the selector assumed a `<header>` element; the site header is a `<div>`. The Tab stops already showed focus on the Cards & Sets button. The selector was corrected and nothing in the app changed.

**Result:** 23/23 menu and dropdown checks pass on the provider-disabled fixture, built from `ce348bd` code. 0 blocked non-allowed requests; no extra page targets.
- The catalogue-view and desktop-regression sections of that verifier were not rerun (`ONLY=menu`); their code is unchanged since they last passed.
- Other suites were not repeated, since no application code changed.

**Review range from production.**
- **Base:** production `f5d0752` (= `origin/main`, re-checked); fast-forward.
- **Range:** `f5d0752..<review HEAD>` covers:
  - `9931dd0` docs — mobile UX r1 deployment ledger. **Carried forward:** a local-only ledger commit from the previous phase, not yet pushed.
  - `ce348bd` feat(sets) — the only application-code commit (`app/globals.css`, `app/sets/page.js`, `components/SetsFilterList.js`, `lib/navLinks.js`, `lib/setChecklist.js`, `tests/scanner/checklist-discovery.test.mjs`)
  - `b67e241` docs — checklist discovery ledger
  - this entry's docs commit — the final review HEAD
- **Last built code commit:** `ce348bd`.

Held for deployment approval. Graded-inventory growth remains queued next.

### Deployment (2026-09-14) — checklist discovery live at `13f5609`

**Authorization and pre-push checks.** The owner approved deploying `13f5609cce10e6af4286def7ab840f2c6b51e2a9`.
- **Remote:** `origin/main` was re-checked immediately before the push and was still `f5d0752…`, so there was no divergence.
- **Scope:** `f5d0752..13f5609` is exactly the 4 reviewed commits (`9931dd0`, the carried-forward mobile UX deployment ledger; `ce348bd` code; `b67e241` docs; `13f5609` docs) across the 7 reviewed files.
- **Push:** fast-forward of only that SHA (`git push origin 13f5609…:refs/heads/main`); the remote was confirmed at `13f5609` afterwards. Unrelated worktrees and held commits were untouched.
- **Last built code commit:** `ce348bd`.

**Vercel.** `dpl_3WQ43rvL9oUsts5CCWgCh94Ns7pt` built `githubCommitSha` `13f5609cce10e6af4286def7ab840f2c6b51e2a9` for production and reached READY about 76s after the build started. It is aliased to `pokemondealfinder.com`, with no alias error. The rollback candidate is `dpl_hU6iqswfep54jfF1BHsD3XAzzXg3` (`f5d0752`).

**Routes used, confirmed free of paid-provider calls.**
- `/sets` and `/sets/<slug>` read only cached Supabase loaders (`fetchSets`, `fetchCatalogSets`, `fetchSetCatalog`, `fetchSetDealsPage`, sealed catalogue, slugs).
- `lib/deals` imports `priceHistory`, which requires only pure constants from `pokemonPriceTracker`. `getCanonicalPriceHistory` (a DB read) is used only by a card-level loader, not on these routes.
- `/pokemon/charizard` was already used in the previous guarded verification.

**Guard.** A browser-level CDP guard with auto-attach on every target was installed before any navigation.
- **Allowed:** exactly `/sets`, `/sets/jungle`, `/sets/ex-legend-maker`, `/sets/xy-promos`, `/pokemon/charizard` (documents and their own RSC), `/_next/static/*`, the deals-page API, and card/set artwork CDNs.
- **Blocked:** every other origin path (including `/cards`, `/deals/<id>` and other set prefetches, `/_next/image`, analytics scripts, `/api/rates`) and every other host (eBay images, the Impact affiliate script, PostHog).
- **Totals:** 121 same-origin and 38 cross-origin requests blocked; 9 page and 38 static requests allowed. No affiliate link was clicked and no checkbox was ticked.

**Production checks, 8/9 automated passes; the 9th is a harness false negative, explained below.**

| Check | Observed |
|---|---|
| Eligible vs unsupported (server HTML) | `/sets` offers "Open checklist" for 16 sets: Base Set 2, Boundaries Crossed, Diamond and Pearl, EX Deoxys, EX Ruby and Sapphire, EX Sandstorm, Fossil, Great Encounters, Gym Heroes, Jungle, Mysterious Treasures, Neo Destiny, Neo Genesis, Neo Revelation, Secret Wonders, Team Rocket. Each set's own page renders `data-checklist-print-root`. EX Legend Maker and XY Promos render no checklist and are not offered. The directory lists 208 sets. |
| Menu (390, touch) | Cards & Sets = Price Checker, Card Database, Sets & Checklists, **Collection checklists**, Browse by Pokemon, Market Data (each 44px) |
| Menu → Collection checklists | lands on `/sets#collection-checklists`; only the checklist view is visible, its tab selected, "Collection checklists (16)", explanation shown once, no overflow; the 16 tiles each have a 44px "Open checklist" |
| Supported set → checklist | Jungle's "Open checklist" → `/sets/jungle#inventory`, section at 96px, "Checklist" selected, 64 ownership boxes, "0 of 64 entries marked owned · 64 still missing", "Print checklist" present |
| Existing set navigation | Menu "Sets & Checklists" → `/sets` with no hash, All sets view, filter present, all 208 set links, "Open checklist" only on the 16. Typing "Legend Maker" narrows the list to `/sets/ex-legend-maker` ("1 of 208 sets match"). Tapping that tile opens its page, which shows "Browse cards ↓", "Gallery / Card list" and no checklist. |
| Harness false negative | "/sets carries both views, one explanation…" failed on an HTML text count of 2. Re-inspection: one occurrence is the rendered page (outside `<script>`), the other is the RSC flight payload inside `<script>`. Both view ids are present, and the in-browser visible count was 1. No page defect. |

Screenshots (scratchpad `prod-cl/`): menu Cards & Sets, the collection checklists view, and the Jungle checklist, all at 390px.

**Limitations.**
- Chromium only.
- One supported set's journey (Jungle) was exercised in the browser; the other 15 were confirmed through their server-rendered pages.
- The desktop dropdown was not re-exercised in production; it was verified on the fixture from the same code.

No scanner, budget, newsletter or social change. This ledger entry is a local-only commit on `checklist-discovery-r1`, **not pushed**. Graded-inventory growth remains the next phase.

### Integrity release r1 (Claude, local, 2026-09-14) — release scope, safety outcome and quarantine proposal (for owner approval)

**Status:** not deployed; no database write; no scanner activation; no eBay/PPT call. The only production access was read-only SELECTs (recheck plus dry run).

#### Deployment scope

- **The optimisation is not gated.** Graded lookup optimisation `257e221` changes `app/api/refresh-deals` sweep and per-card code with no environment flag, and those paths run on existing crons: US sweep every 15 min, other markets every 2h, allocated scans twice daily per market. Deploying branch `integrity-r1` would therefore have **started it automatically**.
- **Release branch without it.** `integrity-release-r1` was built from `13be2e3` (production `13f5609` + the checklist-deployment ledger). The integrity fix was cherry-picked as `c7c824a` (from `2915592`) without the optimisation:
  - `refresh-deals` imports only `titleClaimsSlabGrade`
  - the per-card scan keeps production's `listings.find((l) => l.isGraded)`
  - the e2e memo test now asserts production's per-row graded lookups (3), which fails if the optimisation is present
- **Original branch preserved, not rewritten.** `integrity-r1` (`8446e5b`) still carries `257e221`, the growth investigation `c88c858`, the unadapted fix `2915592` and the growth-record corrections, all inactive and pending review.
- **Release range `13f5609..<release HEAD>`:**
  - `13be2e3` docs — checklist discovery deployment ledger, carried forward
  - `c7c824a` fix(integrity) — the only application-code commit: `lib/dealMatching.js`, `lib/dealQuality.js`, `app/api/refresh-deals/route.js`, `app/api/ingest-feed/route.js`, plus tests and the offline harness
  - `285662c` chore(remediation) — manifest, dry-run/apply/rollback script, SQL equivalent and tests; none of it runs on deploy
  - this ledger entry (docs)
- **Side effect disclosed, not an experiment:** refusing wrong-card and slab-titled candidates also removes the provider calls those candidates used to trigger (e.g. raw condition lookups for rejected listings). No cap, schedule, allocation or threshold changes.

#### Safety outcome (release branch, offline, provider-disabled)

| Outcome | Evidence |
|---|---|
| New demonstrated wrong-card matches prevented | Harness, real handlers: sweep, per-card and feed write the "Pikachu TG05/TG30" listings only as Pikachu TG05/TG30. 0 writes of "#SV64 Lucario" as SV22, and 0 of "#69 / #69/68" as the SM210 promo. Tests IR-1, IR-3 and IR-E2E sweep/percard/feed. |
| No raw savings claims on the demonstrated slab-titled listings | Harness: 0 raw writes for the 5 slab titles on all three paths (feed `slabTitleOnRaw` = 5); stored 27488, 35441, 35970 and 37955 hidden with `identity:graded_title_on_raw`. "PSA 10 Contender" is still a displayable raw deal. Tests IR-4, IR-5, IR-6, IR-E2E. |
| Confirmed existing wrong-card rows stop displaying | **Needs the quarantine below**: the release gate alone still shows them (IRQ-2). After the proposed quarantine, all 23 high-confidence rows are hidden and 37907 is left for review (IRQ-4). A later scanner sighting does not re-publish them (IRQ-5), and rollback restores without reactivating (IRQ-7). |
| No optimisation in the release | IR-E2E memo: 3 grading lookups (production behaviour). |
| Unchanged baseline failures | Scanner suite 3,340 tests / 3,294 pass / **24 fail — identical failing set to the production baseline** (no new failures; the 24 pre-existing failures remain unfixed and are disclosed here). 22 skipped. `next build` exit 0; ESLint clean on changed files. |

#### Quarantine proposal (dry run 2026-09-14T02:43Z, read-only against production)

- **Mechanism:** the existing exclusion column `deals.disqualified_reason` = `identity:collector_number_conflict`. Any non-null reason fails `isDisplayableDeal` and `isVerificationCandidate`.
- **Never changed:** `is_active`, card/watchlist identity, prices, discounts, timestamps. No identity rewrite, no re-pricing, no reactivation.
- **Guard (per row):** id, `is_active = true`, `disqualified_reason IS NULL`, `listing_id`, `marketplace`, `card_tcgplayer_id`, unchanged title, **and** the title still conflicting with the current catalogue number under the shipped matcher.
- **Social content:** does not read disqualified rows (count hard-coded 0).

**Expected affected rows: 23.** Held for owner review: **37907** (possible seller mislabel). Skipped as changed since review: 0. Prior value for every row: `disqualified_reason = NULL`, `is_active = true`; the full prior values and row snapshots are in the manifest.

| Deal | eBay listing | Mkt | Title (listing) | Stored identity | Evidence | Confidence | Displayable now | Proposed |
|---|---|---|---|---|---|---|---|---|
| 33696 | `v1|278303338612|0` | US | Deoxys VSTAR GG46/GG70 SWSH: Crown Zenith: Galarian Gallery Holo | Deoxys VMAX / SWSH: Crown Zenith: Galarian Gallery / #GG45/GG70 | title GG46/GG70 (Deoxys VSTAR) vs stored GG45/GG70 (Deoxys VMAX) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 34031 | `v1|188891932883|0` | CA | Pikachu VMAX (Secret) Ultra Rare SWSH11: Lost Origin Trainer Gallery TG29/TG30 | Pikachu VMAX / SWSH11: Lost Origin Trainer Gallery / #TG17/TG30 | title TG29/TG30 (Pikachu VMAX secret) vs stored TG17/TG30 | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 34467 | `v1|366211592992|0` | GB | Magikarp Promo XY Generations 20th Anniversary Card 22/83 NM Holo Sealed  | Magikarp / XY Promos / #XY143 | title Generations 22/83 vs stored XY Promos XY143 | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 35264 | `v1|278303338612|0` | AU | Deoxys VSTAR GG46/GG70 SWSH: Crown Zenith: Galarian Gallery Holo | Deoxys VMAX / SWSH: Crown Zenith: Galarian Gallery / #GG45/GG70 | title GG46/GG70 (Deoxys VSTAR) vs stored GG45/GG70 (Deoxys VMAX) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37241 | `v1|407211076200|0` | US | Deoxys VSTAR GG46/GG70 SWSH: Crown Zenith: Galarian Gallery Holo | Deoxys VMAX / SWSH: Crown Zenith: Galarian Gallery / #GG45/GG70 | title GG46/GG70 (Deoxys VSTAR) vs stored GG45/GG70 (Deoxys VMAX) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37248 | `v1|178489674337|0` | US | Detective Pikachu Holofoil SMP SM190 Framestore NM | Detective Pikachu / Detective Pikachu / #10/18 | title SM Black Star promo SM190 ("SMP SM190") vs stored Detective Pikachu set 10/18 | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37357 | `v1|147389881431|0` | CA | Pikachu TG05/TG30 Swsh11: Lost Origin Trainer Gallery Holo | Pikachu V / SWSH11: Lost Origin Trainer Gallery / #TG16/TG30 | title TG05/TG30 (Pikachu) vs stored TG16/TG30 (Pikachu V) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37358 | `v1|287498863281|0` | CA | Pikachu Tg05/Tg30 Swsh11: Lost Origin Trainer Gallery Holo | Pikachu V / SWSH11: Lost Origin Trainer Gallery / #TG16/TG30 | title TG05/TG30 (Pikachu) vs stored TG16/TG30 (Pikachu V) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37360 | `v1|407094601596|0` | CA | Pikachu VMAX TG17/TG30 Swsh11: Lost Origin Trainer Gallery Holo | Pikachu V / SWSH11: Lost Origin Trainer Gallery / #TG16/TG30 | title TG17/TG30 (Pikachu VMAX) vs stored TG16/TG30 (Pikachu V) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37494 | `v1|206552503131|0` | US | Mimikyu VMAX TG17/TG30 Swsh09: Brilliant Stars Trainer Gallery Holomi | Mimikyu V / SWSH09: Brilliant Stars Trainer Gallery / #TG16/TG30 | title TG17/TG30 (Mimikyu VMAX) vs stored TG16/TG30 (Mimikyu V) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37508 | `v1|287582558535|0` | US | Deoxys Holo Ultra Rare SWSH: Crown Zenith: Galarian Gallery GG12/GG70 NM | Deoxys VMAX / SWSH: Crown Zenith: Galarian Gallery / #GG45/GG70 | title GG12/GG70 (Deoxys) vs stored GG45/GG70 (Deoxys VMAX) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37512 | `v1|287582558535|0` | AU | Deoxys Holo Ultra Rare SWSH: Crown Zenith: Galarian Gallery GG12/GG70 NM | Deoxys VMAX / SWSH: Crown Zenith: Galarian Gallery / #GG45/GG70 | title GG12/GG70 (Deoxys) vs stored GG45/GG70 (Deoxys VMAX) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37537 | `v1|198637134387|0` | IT | Genesect EX XY - Fates Collide #64/124 | Genesect / XY Promos / #XY119 | title Fates Collide #64/124 vs stored XY Promos XY119 | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37548 | `v1|800651838014|0` | US | Deoxys VSTAR GG46/GG70 SWSH: Crown Zenith: Galarian Gallery Holo | Deoxys VMAX / SWSH: Crown Zenith: Galarian Gallery / #GG45/GG70 | title GG46/GG70 (Deoxys VSTAR) vs stored GG45/GG70 (Deoxys VMAX) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37561 | `v1|178490933774|0` | US | Deoxys Holo Ultra Rare SWSH: Crown Zenith: Galarian Gallery GG12/GG70 NM | Deoxys VMAX / SWSH: Crown Zenith: Galarian Gallery / #GG45/GG70 | title GG12/GG70 (Deoxys) vs stored GG45/GG70 (Deoxys VMAX) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37743 | `v1|137732002135|0` | US | Shaymin EX (106 Full Art) XY - Roaring Skies [106/108] UR Holofoil NM Pokemon | Shaymin EX / XY Promos / #XY148 | title Roaring Skies 106/108 vs stored XY Promos XY148 | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37752 | `v1|147389881431|0` | AU | Pikachu TG05/TG30 Swsh11: Lost Origin Trainer Gallery Holo | Pikachu V / SWSH11: Lost Origin Trainer Gallery / #TG16/TG30 | title TG05/TG30 (Pikachu) vs stored TG16/TG30 (Pikachu V) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37753 | `v1|287498863281|0` | AU | Pikachu Tg05/Tg30 Swsh11: Lost Origin Trainer Gallery Holo | Pikachu V / SWSH11: Lost Origin Trainer Gallery / #TG16/TG30 | title TG05/TG30 (Pikachu) vs stored TG16/TG30 (Pikachu V) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37788 | `v1|366666393554|0` | CA | Mimikyu VMAX TG17/TG30 SWSH09 Brilliant Stars Trainer Gallery Holo 2022 | Mimikyu V / SWSH09: Brilliant Stars Trainer Gallery / #TG16/TG30 | title TG17/TG30 (Mimikyu VMAX) vs stored TG16/TG30 (Mimikyu V) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37797 | `v1|366666393554|0` | DE | Mimikyu VMAX TG17/TG30 SWSH09 Brilliant Stars Trainer Gallery Holo 2022 | Mimikyu V / SWSH09: Brilliant Stars Trainer Gallery / #TG16/TG30 | title TG17/TG30 (Mimikyu VMAX) vs stored TG16/TG30 (Mimikyu V) | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37907 | `v1|188925760161|0` | US | Feraligatr Prime HGSS07 Heartgold Soulsilver NM | Feraligatr (Prime) / HeartGold SoulSilver / #108/123 | title "HGSS07" vs stored HeartGold SoulSilver 108/123; title also says "Prime" and names the set - possible seller mislabel; excluded from mutation | uncertain | yes | **none — owner review** |
| 37910 | `v1|407213974189|0` | US | Vintage Detective Pikachu SM190 Sm Holo | Detective Pikachu / Detective Pikachu / #10/18 | title SM Black Star promo SM190 vs stored Detective Pikachu set 10/18 | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37947 | `v1|397092730462|0` | IT | Rayquaza VMAX (Segreto) Segreto Raro SWSH12: Silver Tempest Trainer Gallery TG29/T | Rayquaza VMAX / SWSH12: Silver Tempest Trainer Gallery / #TG20/TG30 | title TG29 (title truncated at "TG29/T"; "Segreto" = secret) vs stored TG20/TG30 | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |
| 37949 | `v1|397271492993|0` | IT | Rayquaza VMAX (Segreto) Segreto Raro SWSH12: Silver Tempest Trainer Gallery TG29/T | Rayquaza VMAX / SWSH12: Silver Tempest Trainer Gallery / #TG20/TG30 | title TG29 (title truncated at "TG29/T"; "Segreto" = secret) vs stored TG20/TG30 | high | yes | set `disqualified_reason` = `identity:collector_number_conflict` |

**Confidence basis:**
- **High (16):** title and catalogue use the same subset prefix with a different number (GG46/GG12 vs GG45, TG05 vs TG16, TG17 vs TG16, TG29 vs TG17).
- **High (2):** same, in titles truncated at "TG29/T…" and backed by "Segreto" (secret rare).
- **High (3):** a full set number stored against a Black Star promo (22/83 vs XY143, #64/124 vs XY119, 106/108 vs XY148).
- **High (2):** an explicit three-digit promo number "SM190" stored against the Detective Pikachu set card 10/18.
- **Uncertain (1):** 37907 — "HGSS07" against HeartGold SoulSilver 108/123, where the title also says "Prime" and names the set.

#### Approval procedure (when authorised; not done)

1. **Deploy the release** (exact SHA below).
2. **Re-run the dry run immediately before writing:** `node scripts/remediation/integrityR1Quarantine.mjs --out=quarantine-plan.json`. Rows retired or changed since review show as `skip`; use the new eligible count.
3. **Apply:** `node scripts/remediation/integrityR1Quarantine.mjs --apply --confirm=<eligible count> --prior-out=integrity-r1-quarantine-prior-<timestamp>.json`. It refuses without a matching `--confirm`, writes the prior-values file before the first update, and exits non-zero if the written count differs. (`supabase/data_corrections/2026-09-14_integrity_r1_collector_number_quarantine.sql` is the reviewable SQL equivalent, expected 23.)
4. **Verify:** read back the rows; `disqualified_reason` should be set on exactly the confirmed count, and the rows should not be displayable.

**Rollback:**
- **Quarantine:** `node scripts/remediation/integrityR1Quarantine.mjs --rollback=<prior file> --confirm=<rows in file>`. It restores each row's saved prior value (NULL) only where `disqualified_reason` still equals `identity:collector_number_conflict`, and never touches `is_active`, so rows the freshness TTL retired meanwhile stay retired. The SQL rollback statement is in the data-correction file.
- **Release:** redeploy `dpl_3WQ43rvL9oUsts5CCWgCh94Ns7pt` (`13f5609`) in Vercel; no data migration is involved.

**Queue (unchanged):**
- **Graded retention/recovery:** Part A and Part B remain inactive.
- **Graded lookup optimisation (`257e221`):** inactive on `integrity-r1`.
- **Grader-title conflict (34213) and the remaining ambiguous-number cases:** not in scope.
- **"All deals" browsing:** still queued.

### Deployment (2026-09-14) — integrity release r1 live at `ca18144`; 23-row quarantine applied

**Authorization:** the owner approved deploying `integrity-release-r1` at `ca181441edfe17d65c4cf6b6520b5ff8b7817a4f` and quarantining only the 23 high-confidence manifest rows.

**Pre-push checks:**
- `origin/main` was `13f5609`; the release was a fast-forward.
- The range `13f5609..ca18144` was exactly the 4 reviewed commits (`13be2e3`, `c7c824a`, `285662c`, `ca18144`).
- `257e221` is not in the range. `integrity-r1` is untouched at `8446e5b`.
- Only that SHA was pushed; the remote was confirmed at `ca18144` afterwards.

**Vercel:** `dpl_CT3ASTzEiBqhaGSBa3FzYiuB5kbK` built `githubCommitSha` `ca18144…` for production and reached READY about 60s after the build started, with `pokemondealfinder.com` aliased and no alias error. Rollback candidate: `dpl_3WQ43rvL9oUsts5CCWgCh94Ns7pt` (`13f5609`).

**Quarantine** (after READY; `scripts/remediation/integrityR1Quarantine.mjs`):

| Step | Result |
|---|---|
| Pre-quarantine read-only snapshot (02:53Z) | The 23 rows were active, reason-free and displayable under the deployed rules. The 5 slab-titled raw rows (27488, 35441, 35970, 37927, 37955) were already not displayable under the deployed rules. 37907 was displayable. |
| Post-deploy dry run (02:53Z) | 23 quarantine, 1 review (37907), **0 skipped** |
| Apply (02:54:06Z), `--confirm=23` | **Written 23 of 23; skipped 0; errors 0.** The prior-values file was written before the first update. Only `disqualified_reason` changed, to `identity:collector_number_conflict`. `is_active`, identity, prices and timestamps are unchanged. 37907 was not touched. |

**Applied ids:** 33696, 34031, 34467, 35264, 37241, 37248, 37357, 37358, 37360, 37494, 37508, 37512, 37537, 37548, 37561, 37743, 37752, 37753, 37788, 37797, 37910, 37947, 37949.

**Verification** (guarded, read-only):
- No browser, no eBay/PPT calls, no `/deals/<id>` or affiliate URLs.
- Only plain GETs of DB-backed routes: `/api/deals-page`, `/sets/*`, `/pokemon/*`, `/`, `/best-finds`, `/deals`, `/deals/<category>`.
- The display rules applied are the deployed `lib/dealQuality` at `ca18144`.

| Layer | Observed |
|---|---|
| **Database exclusion** (02:54:29Z, again 02:59:02Z) | 23/23 carry the reason, 23/23 still `is_active=true`, **0/23 displayable** under the deployed `isDisplayableDeal`. Slab rows: 0/5 displayable (named reason `identity:graded_title_on_raw`; no DB change). 37907: untouched, still displayable. |
| **Live data API** `/api/deals-page?kind=set` over the affected set × marketplace pairs | 02:54Z and 02:59:02Z: still returned 13 quarantined ids. This was the `unstable_cache` (180 s, stale-while-revalidate) serving the pre-quarantine entry. **02:59:26Z and 02:59:48Z: none of the 28 excluded ids present on any pair.** |
| **Cached set pages** (11 affected `/sets/*`) | 02:54Z: CDN HIT pages still linked 34031, 37561, 37753, 37797, 37910, 37949. 02:59Z: `STALE` responses triggered regeneration. **03:00:09Z and 03:00:24Z: regenerated pages link none of the excluded ids.** |
| **Other listing pages** (`/`, `/best-finds`, `/deals`, 5 deal categories, 9 species pages) | 03:01:04Z: `/deals/modern` (freshly rendered) still linked 37949 from its 180 s deals data cache. **03:01:29Z: no excluded id on any of the 17 pages.** |

**Database exclusion vs cached visibility:** the database exclusion took effect at apply time. Cached copies expire on their documented lifetimes: data caches 180 s, deal pages 600 s, species/set/card pages 3,600 s ISR, each served stale once while regenerating. No tag invalidation was triggered, because the existing `revalidateTag` path runs only inside verify-deals and ingest-feed. Every checked surface was clear by 03:01:29Z. Pages not in the sample (for example `/cards/*`) follow the same gated fetchers and lifetimes, so the maximum exposure is one 3,600 s ISR window plus one stale serve.

**Rollback location:**
- **Prior values:** `scripts/remediation/applied/integrity-r1-quarantine-prior-2026-09-14T02-54-06Z.json` (23 rows, prior `disqualified_reason` NULL, prior `is_active` true).
- **Apply result:** `…/integrity-r1-quarantine-apply-result-2026-09-14T02-54-06Z.json`.
- **Post-deploy dry run:** `…/integrity-r1-quarantine-dryrun-post-deploy-2026-09-14.json`.
- **Command:** `node scripts/remediation/integrityR1Quarantine.mjs --rollback=scripts/remediation/applied/integrity-r1-quarantine-prior-2026-09-14T02-54-06Z.json --confirm=23`. It restores NULL only where the quarantine reason is still present and never touches `is_active`.
- **SQL equivalent:** `supabase/data_corrections/2026-09-14_integrity_r1_collector_number_quarantine.sql`.
- **Release rollback:** redeploy `dpl_3WQ43rvL9oUsts5CCWgCh94Ns7pt`.

**Unchanged and inactive:** graded lookup optimisation `257e221` (branch `integrity-r1`), graded retention Part A / recovery Part B, the 7 excluded recovery candidates, 37907, the grader-title conflict 34213 and the remaining ambiguous-number cases. No scanner, allocator, quota, newsletter or social change.

**Next queued:** "All deals" browsing. The implementation brief is `docs/all-deals-browsing-brief.md` (prepared, not started).

This entry is a local-only commit on `integrity-release-r1`, **not pushed**.

### All deals r1 (2026-09-14) — /deals browses every eligible stored listing with exact counts (local review, not deployed)

**Route and indexing.**
- **Why `/deals`:** it was a category hub with a 12-card preview and had no separate browse-all role. It is now "All deals". `/deals/all` was not added, so there are no competing pages.
- **Unchanged:** canonical `/deals`, `revalidate = 600` and default indexing.
- **No extra indexable pages:** filters, search and `?page=` are read client-side from the same static HTML, and filter pills stay `rel="nofollow"`. No filter or search combination creates an indexable page.
- **Title and description** were reworded to describe the page. They stay framed as browsing, not the homepage head term.
- **Homepage:** unchanged.
- **`RegionRedirect`** is removed from `/deals` only. It would have rewritten the all-marketplaces default into the visitor's region.

**Why a separate inventory index.** `fetchDealsPage` cannot give exact counts:
- its count is a Postgres estimate taken before the display gate;
- it gates after slicing, so pages come up short;
- it dedups by card;
- it caps browsing at 25 pages.

`lib/allDealsInventory.js` is pure and works in three steps:
1. **Per marketplace (cached):** English rows → `isDisplayableDeal` → compact tuple encoding. Nothing ineligible is stored.
2. **Per request:** re-check freshness and ended auctions → dedup by exact `listing_id` → filters (`planDealFilters`) and title search.
3. **Then:** sort → count → slice. Counts and pages come from the same array.

The reader is `fetchAllDealsMarketplace` in `lib/deals.js`. It reads active English rows with `disqualified_reason IS NULL`, keeps one `unstable_cache` entry per marketplace on the existing 180 s cadence, and makes DB reads only.

**Dedup rule.** One tile per eBay listing, chosen as one whole stored copy, so price, currency, shipping statement and destination always travel together. The copy is chosen in this order:
1. the listing's home marketplace (`EBAY_<item_location_country>`);
2. otherwise US, GB, CA, AU, DE, IT;
3. otherwise the lowest id.

The tile reads "Price shown from eBay <marketplace> · also on eBay …". Distinct listings and distinct grades of one card stay separate. Category pages keep their existing per-card dedup and estimated counts.

**Resource limits.** Measured read-only on production, 2026-09-14:

| Measure | Value |
|---|---|
| Active English rows | 1,183 |
| Display-eligible | 1,102 |
| Distinct listings | 865 |
| Listings in 2+ marketplaces | 149, all disagreeing on price, currency or shipping |
| Full-row JSON | 2.5 MB, over the ~2 MB data-cache entry limit |
| Tuple encoding per row | 752 / 804 / 897 B (median / p95 / max) |
| Tuple encoding total | 0.79 MB |
| Largest entry | EBAY_US: 476 rows, 355 KB |
| Uncached read | ~1.9 s |
| Decode + filter + sort | ~3 ms |
| Presentation outputs | identical for compact vs full rows on all 1,098 eligible rows |

What follows from those measurements:
- `MAX_ELIGIBLE_ROWS_PER_MARKETPLACE` = 1,800. That is ≤ 1.6 MB per entry at the max row size, and 3.8× today's largest marketplace.
- `MAX_ACTIVE_ROWS_READ_PER_MARKETPLACE` = 2,500, i.e. three 1,000-row reads.
- Hitting either limit marks that marketplace incomplete. The count is then shown as "at least N" with a note, never as exact, and nothing is dropped silently.
- There is no page cap.

**UI changes, all through existing components.**
- **`DealGrid kind="all"`:**
  - the graded pilot's full filter contract, search and cold-navigation guard;
  - a count line: "Showing a–b of N listings" or "N listings", with lower-bound wording when the count is inexact;
  - an explicit out-of-range state that links to the last page;
  - a non-OK API response is reported as an error.
- **`FilterBar`:** an "All marketplaces" pill, active by default, that clears `country` and `page`.
- **Navigation:**
  - label is now "All deals": first item in the Deals menu, mobile shortcut, and footer label;
  - `DealCategoryPage` breadcrumb reads "All deals", with a header link and "All deals" first in the category chips;
  - `/cards/[slug]`: "← Back to All Deals" pointed at `/`. It is now "← Browse all deals" → `/deals`, so there are no longer two different "All deals" destinations.
- **Unchanged:**
  - `/deals` tiles keep the existing `deals_index` affiliate surface;
  - savings, shipping and currency wording (same `DealCard`);
  - plain listings stay neutral: "View listing on eBay", no badge.

**Verification.**

`tests/scanner/all-deals-r1.test.mjs`: **15/15**. It runs the real module over a shared fixture:
- **Inventory:**
  - 94 eligible listings over 4 pages;
  - cross-marketplace copies that disagree;
  - 3 grades of one card;
  - 0-bid auctions;
  - shipping 0 and shipping not recorded;
  - 14 plain listings.
- **Excluded rows:** quarantined, slab-titled raw, inactive, stale, Japanese and ended-auction.
- **Checked:**
  - identities, counts and per-page sizes;
  - every sort;
  - filters and marketplace scope;
  - out-of-range pages and limit flags;
  - request-time gates;
  - wording parity with full rows.

| Other check | Result |
|---|---|
| Updated pins | `graded-browsing-pilot` (scope now includes All deals); `related-deals-mobile-grid` (/deals renders through DealGrid); `scripts/verifyR3Interactive.mjs` label |
| Scanner suite | 3,355 tests: 3,309 pass, **24 fail (identical failing set to the baseline)**, 22 skipped |
| `next build` | exit 0 (`/deals` static, 3m) |
| ESLint on changed files | 0 new problems. Pre-existing: 2 `react-hooks/purity` errors in `app/cards/[slug]/page.js` (present at HEAD) and 1 `exhaustive-deps` warning in DealGrid (present at HEAD) |
| `tests/seo` | not run; it needs a running production-like server |

**Browser checks.** Provider-isolated R3 fixture with the established CDP guard: **64/64 checks** passed, plus state screenshots.
- **Pagination:**
  - every page crawled by clicking Next: tiles 24/24/24/22;
  - exact expected id sequence, no excluded row, no losing copy;
  - back, forward and reload restore exact pages.
- **Filters:**
  - from page 2, filters reset the page: Graded 3, PSA 2, PSA 10 = 1, each restored by history;
  - filters survive pagination: BIN (90, 4 pages), maxPrice + price_asc (37), raw + $100+ + discount (44);
  - AUCTION, GB and search also checked;
  - the All marketplaces pill and keyboard search submit both work.
- **Loading and error states:**
  - out-of-range page 9 shows the explicit state;
  - slow API: skeleton, no default tiles, no count;
  - cold filtered URL with JS held: the server default stays hidden behind the placeholder, then exactly the PSA listings appear;
  - API 500: error shown, no tiles, no count.
- **Layout:**
  - 320/390/430 px, light and dark: no horizontal overflow;
  - filter pills, the multi-marketplace tile, images and pagination all fit;
  - desktop dark loads images.
- **Keyboard:** Tab reaches a filter pill with a visible focus ring, and Enter applies it.
- **Navigation:** the category page and mobile menu link to All deals.
- **Guard:**
  - 0 `/deals/<id>` requests;
  - card artwork was the only cross-origin traffic allowed.

**Not changed:**
- homepage lanes and ranking;
- category, species, set and card loaders and counts;
- scanner, allocator, quota, providers and sitemap;
- graded optimisation `257e221`, retention and recovery.

No production writes. Not pushed, not deployed.

#### All deals r1: acceptance follow-up (2026-09-14, local, not deployed)

Built on review SHA `4013a60`. Only demonstrated gaps were changed.

1. **Japanese inventory.**
   - **Cause:** the r1 reader filtered `card_language = 'english'`, and the pure module repeated that filter. This was my own scoping choice, carried over from the English-default category loaders, not a comparison-safety rule.
   - **Why including them is safe:** Japanese-catalogue rows live in the same `deals` table and pass the same `isDisplayableDeal` gate, which requires the listing's stated language to match the catalogue language. The scanner additionally requires explicit "Japanese" evidence before matching, and each row carries its own Japanese-catalogue reference.
   - **Production, read-only:** 67 active Japanese rows with no reason set; 48 eligible (43 listings: US 25, GB 10, CA 7, AU 3, DE 2, IT 1). The other 19 are hidden by the gate: 17 `identity:visual_mismatch`, 1 `authenticity:proxy_or_counterfeit`, 1 other.
   - **Fix:** the language pre-filter is removed from both places. The cache key is now `all-deals-inventory-v2`. The page copy says "English and Japanese" and that sealed products have their own page.
   - **Limits unchanged:** all languages give 906 distinct eligible listings; EBAY_US is the largest marketplace at 501 eligible rows / 365 KB; the largest encoded row is still 897 B.
   - **Observed, not changed:** one listing (Hoopa 155/XY-P) is stored with Japanese-catalogue copies on US/GB and an English-catalogue copy on IT. The tile shows one whole copy, including its identity and reference.
2. **Filtered URL indexing.**
   - **Gap:** filtered, search and pagination variants of `/deals` returned the clean page's HTML with canonical `/deals` and no robots signal.
   - **Fix:** `next.config.mjs` header rules send `X-Robots-Tag: noindex, follow` when `/deals` has any of these params: `country`, `type`, `grader`, `grade`, `listing`, `minPrice`, `maxPrice`, `q`, `sort`, `page`. This follows the existing `/search?q=` and homepage `?page=N` policy while keeping `/deals` static. `docs/indexability.md` is updated.
   - **Fixture HTTP check:**
     - Clean `/deals`: 200, no X-Robots-Tag, no robots meta, canonical `https://pokemondealfinder.com/deals`, H1 "All deals".
     - Structured data: CollectionPage description equals the meta description. The breadcrumb is Deals → All deals. ItemList has 24 entries whose ids match the 24 SSR tiles in order, all bare `/deals/<id>` URLs.
     - `?q=zekrom`, `?type=graded&grader=PSA`, `?page=2`, `?country=EBAY_AU`, `?sort=price_asc` and `?listing=AUCTION&maxPrice=50` all return `noindex, follow` with canonical `/deals`.
     - `?utm_source=` and empty `?q=` render the default page and stay indexable with canonical `/deals`.
3. **Marketplace selection after dedup.**
   - **No code change.** A marketplace filter narrows to that marketplace's stored copies before dedup, so a listing stored there is always included and shown from that marketplace's own complete copy.
   - **Demonstrated** with the disagreeing-copy fixture: All shows the GB home copy 971002. Australia shows AU copy 971003 at A$48.00 incl. A$9.00 shipping, labelled "Listed on eBay Australia" with the AU flag. US shows 971001 in USD. The JP-located listing that shows as CA under All is shown as its AU copy under Australia.
   - **Browser count:** the AU count (17) and ids match the module exactly.
4. **Inventory limits.**
   - **Gap:** the "at least"/limitation notice rendered only when the result had tiles. An empty result or out-of-range page from an incomplete inventory showed no notice.
   - **Fix:** the notice now renders on every result built from an incomplete inventory.
   - **Browser checks:** with the API response produced by the real module over a read-limited GB chunk or an eligible-row-capped US chunk:
     - PSA 10 shows "At least 1 listing" plus the notice.
     - Auctions under the cap show "At least 4 listings" plus the notice.
     - BIN shows "Showing 1–24 of at least 92 listings" plus the notice.
     - An empty search shows the notice above the empty state.
     - Page 99 shows the notice plus the out-of-range state.
     - Controls against the complete fixture show exact wording and no notice.

**Checks:**

| Check | Result |
|---|---|
| `all-deals-r1` | 19/19 (new AD-16 to AD-19; counts updated for 2 Japanese fixture listings, now 96 over 4 pages) |
| Scanner suite | 3,359 tests: 3,313 pass, **24 fail (identical baseline set)**, 22 skipped |
| `next build` | exit 0 (`/deals` still static) |
| ESLint | no new problems |
| Fixture browser checks | 17/17, guard: 0 `/deals/<id>` requests |

Not pushed, not deployed.

#### All deals r1: Hoopa 155/XY-P cross-language identity conflict (2026-09-14, local, not deployed)

**Evidence (read-only).** Listing `v1|147570453677|0` is stored three times. Seller `tokyopremiumexchangeltd`, item location JP.

| Row | Marketplace | Title evidence | Stored identity | Reference | Displayable |
|---|---|---|---|---|---|
| 37856 | EBAY_US | "Japanese" | japanese, 602060 (watchlist 28031, "XY-P: XY Promos") | $186.44 | yes |
| 37861 | EBAY_GB | "Japanese" | japanese, 602060 | $186.44 | yes |
| 37863 | EBAY_IT | Italian title, "giapponese" ×2 | **english, 489917** (watchlist 18616, "XY Promos") | $210.57 | **yes** |

The correct identity is the Japanese promo: every copy's own title says Japanese, and the seller and item location are Japanese. 37863 got the English identity because `classifyListingLanguage` does not recognise "giapponese" and returns `unknown`, which `languageCompatible` accepts. The current display rules therefore do **not** exclude the wrong copy.

Before this change, `/deals?country=EBAY_IT` would show 37863 with a trusted "36% below market" comparison against the English reference.

**Safeguard.** Scoped to All deals only; no scanner or matcher change.
- `identityConflictKeys` in `lib/allDealsInventory.js` withholds any listing whose eligible stored copies disagree on catalogue identity (language, product id, graded/grader/grade). The listing is withheld in every scope and every count.
- It never picks an identity by marketplace preference.
- Detection runs across all six marketplace inventories, so `fetchAllDealsPage` now always loads all six cached entries and applies a selected marketplace afterwards.
- Result field: `identityConflictsWithheld`.

**Verification.**
- **Production data** (read-only, real module): exactly one conflicting listing, Hoopa. It is withheld in All (905 listings), US (500), GB (161) and IT (81).
- **Unit test AD-20:**
  - fixture modelled on the production case: Japanese identity on US, English identity with an Italian "giapponese" title on IT, each copy passing the row gate;
  - withheld in All, US, IT and GB, and not counted;
  - agreeing multi-copy listings untouched;
  - a grade disagreement also counts as a conflict;
  - the reader does not scope its load to one marketplace.
- **Old module check:** the previous module shows the conflict copy in both All and IT.
- **Fixture runtime API:** withheld in all, IT, US, `q=giapponese` (0) and `q=clefable`.

**Not covered by code; write proposed separately (not applied):** on other surfaces that list single rows (English set, card and species grids), 37863 remains eligible until quarantined. The proposed guarded one-row `disqualified_reason = 'identity:language_conflict'` update, with rollback, is in the owner handoff.

The same unrecognised-"giapponese" cause appears on six single-copy EBAY_IT rows (34424, 37288, 37466, 37973, 37974, 37975). They were reported, not verified and not changed; the durable fix is a matcher change.

**Checks:**

| Check | Result |
|---|---|
| `all-deals-r1` | 20/20 |
| Scanner suite | 3,360 tests: 3,314 pass, **24 fail (identical baseline set)**, 22 skipped |
| `next build` | exit 0 |
| ESLint | clean |

Not pushed, not deployed.

### Language-mismatch quarantine proposal (2026-09-14): PROPOSED, NOT APPLIED

**Scope.** Only the seven EBAY_IT rows reported during All deals review: 37863, 34424, 37288, 37466, 37973, 37974, 37975. Their titles state Japanese in Italian ("giapponese"), but they are matched to an English catalogue identity with an English market reference.

**Branch.** This package sits on local branch `language-quarantine-r1`, one commit on top of the All deals review SHA `f544df8`. It contains no runtime code: a remediation script, manifest, dry run, SQL equivalent and a test. The deployment SHA stays `f544df8`.

**Read-only recheck.**
- All 7 rows are active with no reason set, and all are displayable today.
- The language classifier returns `unknown` for every title, so the display gate's language rule does not fire.
- 34424 is a graded slab, and graded rows skip that rule entirely.

**Confirmed mismatches (high confidence, 3):**

| Row | Listing | Stored as | Evidence |
|---|---|---|---|
| 37863 | `v1\|147570453677\|0` | English Hoopa 155/XY-P, XY Promos (489917), $210.57 | "giapponese" ×2. The same listing's EBAY_US/GB copies (37856, 37861) say "Japanese" ×2 and are matched to the Japanese promo 602060. Seller tokyopremiumexchangeltd, item location JP. |
| 34424 | `v1\|318842446719\|0` | English Rayquaza, EX Emerald (88626), PSA 7, $500 | "M Rayquaza-EX RR Emerald Break giapponese PSA 7". Emerald Break is a Japanese-only expansion and RR a Japanese rarity code. It is also a different card. Seller mercuriusjapan, item location JP. |
| 37288 | `v1\|227508043403\|0` | English Misty's Tentacruel, Gym Heroes (87552), $27.78 | "Giapponese", plus "1998" (Japanese Gym year; English 2000) and "n.073" (Pokedex-number numbering on Japanese Gym prints; English is 10/132). |

**Uncertain, not mutated (4):** 37466, 37973, 37974, 37975.
- They come from one German seller (lowil-2781, item location DE), all using one templated title.
- The titles say "giapponese" but also carry German card names (Tentoxa, Panzaeron, Blubella), the German set abbreviation "Gsnw" and "Wotc". Those markers fit a German WotC print.
- The stored data has no Language item specific and no images to tell the two readings apart.
- They remain displayable with an English comparison pending owner review.

**Proposal.** `scripts/remediation/languageMismatchQuarantine.mjs` follows the same contract as the applied integrity-r1 quarantine.
- **Change:** sets `disqualified_reason = 'identity:language_conflict'` on the 3 confirmed rows. Nothing else changes: no identity rewrite, and `is_active`, prices and timestamps are untouched.
- **Guards:** the plan requires the title to be unchanged and still state Japanese. Each write is guarded on `id`, `is_active=true`, `disqualified_reason IS NULL`, `listing_id`, `marketplace`, `card_tcgplayer_id` and `card_language='english'`.
- **Safety:** `--confirm` must equal the eligible count, and the prior-values file is written before the first update.
- **Rollback:** `--rollback=<prior file> --confirm=3` restores NULL only where the reason is still present.
- **SQL equivalent:** `supabase/data_corrections/2026-09-14_language_mismatch_quarantine.sql`.
- **Production dry run** (read-only, `scripts/remediation/language-mismatch-quarantine-dryrun-2026-09-14.json`): **3 quarantine, 4 review, 0 skip.** Expected affected rows: 3. Prior values: NULL / active.

**Tests.** `tests/scanner/language-mismatch-quarantine.test.mjs`: **8/8**, run offline on the reviewed snapshots.
- **Gap and plan:** the gap is reproduced (all 7 displayable, classifier `unknown`), and the plan comes out 3/4/0.
- **Apply:**
  - a wrong `--confirm` writes nothing;
  - exactly 3 rows change, and only the exclusion column;
  - the uncertain rows and the Japanese Hoopa copies are untouched;
  - a scanner sighting does not re-publish a quarantined row.
- **Guards and rollback:** guards skip rows whose identity or title changed, a newer reason is never overwritten, and rollback is correct.
- **All deals afterwards:**
  - before the quarantine, the Hoopa listing is withheld in every scope (identity conflict);
  - afterwards, the two Japanese copies form **one** listing: 37856 (EBAY_US), also on EBAY_GB, Japanese identity 602060, reference $186.44;
  - GB scope shows 37861, and IT scope shows nothing for Hoopa;
  - no tile in any scope carries the English 489917 reference or a quarantined row.

**Checks:**

| Check | Result |
|---|---|
| Scanner suite | 3,368 tests: 3,322 pass, **24 fail (identical baseline set)**, 22 skipped |
| ESLint, new files | clean |

**Applying.** Deploy `f544df8` first, then on explicit approval:

```
node scripts/remediation/languageMismatchQuarantine.mjs --apply --confirm=3 --prior-out=scripts/remediation/applied/language-mismatch-quarantine-prior-<timestamp>.json
```

Cached copies clear within their documented lifetimes: data caches 180 s, deal pages 600 s, species/set/card ISR 3,600 s, each plus one stale serve.

**Durability caveat** (same as integrity-r1): discovery sightings do not clear the reason. If the verifier later retires a row as sold, the reason becomes an availability reason, and a seen-again recovery could later clear it.

### Follow-up (separate, not started): localized language markers in the matcher

`classifyListingLanguage` (lib/dealMatching.js, shared by the scanner and the display gate) only knows English-language words and a few native forms. It returns `unknown` for localized statements of a language, for example Italian "giapponese". `languageCompatible("unknown", card)` then accepts any catalogue language. That is how 7 EBAY_IT rows were matched and shown against English references.

**Proposed fix:**
- recognise localized language words for the scanned marketplaces (Italian giapponese, German japanisch, French japonais/japonaise, Spanish japonés/japonesa, and the equivalents for other languages);
- replay-test the change against stored titles before it touches matching;
- decide whether a graded row should also be subject to the listing-language rule (graded rows currently skip it; see 34424).

This is a scanner and matcher change, so it needs its own approval and verification. It is not part of the All deals deployment or this quarantine.

### Deployment (2026-09-14): All deals live at `f544df8`; language-mismatch quarantine applied (3/3)

**Authorization:** the owner approved deploying All deals at `f544df891fcb3b6e97e278d81db98259cc7259f1`, then quarantining only rows 37863, 34424 and 37288.

**Pre-push checks:**
- `origin/main` was `ca18144` (`git ls-remote`).
- The range `ca18144..f544df8` was a fast-forward of exactly the 4 reviewed commits: `9f1af4c`, `4013a60`, `ac6d684`, `f544df8`.
- `257e221` is not in the range. `integrity-r1` is untouched at `8446e5b` and was not pushed.
- Only `f544df8` was pushed to `main` (04:28:08Z); the remote was confirmed at `f544df8`.
- The remediation package `844d068` (branch `language-quarantine-r1`) was not pushed.

**Vercel:** `dpl_29PrxK5LPnD6UjU52kWFu3dCxqmX` built `githubCommitSha` `f544df8…` for production and was READY at 04:29:25Z (build ~74 s). `pokemondealfinder.com` is aliased with no alias error. Rollback candidate: `dpl_CT3ASTzEiBqhaGSBa3FzYiuB5kbK` (`ca18144`).

**Quarantine.** Run after READY, from the reviewed local package `844d068`; the script and manifest were confirmed identical to that commit.

| Step | Result |
|---|---|
| Post-deploy dry run (04:32:02Z) | **3 quarantine (37863, 34424, 37288), 4 review, 0 skip**, exactly the approved set. All three active, reason NULL, displayable. |
| Apply (04:32:13Z), `--confirm=3` | **Written 3 of 3; skipped 0; errors 0.** The prior-values file was written before the first update. Only `disqualified_reason` changed, to `identity:language_conflict`; `is_active`, identity, prices and timestamps unchanged. |

**Rows.**

| Row | Listing | Stored identity (not rewritten) |
|---|---|---|
| 37863 | `v1\|147570453677\|0` | English Hoopa 155/XY-P |
| 34424 | `v1\|318842446719\|0` | English Rayquaza EX Emerald, PSA 7 |
| 37288 | `v1\|227508043403\|0` | English Misty's Tentacruel, Gym Heroes |

**Verification.** Guarded throughout: plain GETs of browse pages and `/api/deals-page`, plus the CDP network guard for the browser. Nothing blocked by the guard was fetched: `/deals/<id>`, `/cards/*`, `/search`, analytics, affiliate, eBay and image hosts.

| Layer | Observed |
|---|---|
| **Database exclusion** (read-only, 04:32:32Z) | 37863 / 34424 / 37288: reason `identity:language_conflict`, still `is_active=true`, **not displayable**. Japanese Hoopa copies 37856 / 37861: unchanged and displayable. The 4 uncertain rows: unchanged (reason NULL, displayable). The real inventory module over live rows gives 902 listings with 0 identity conflicts. Hoopa appears once as 37856 (EBAY_US, Japanese 602060, $186.44, also on EBAY_GB); US scope 37856, GB scope 37861, IT scope none. |
| **Clean page and indexing** | `/deals` 200, no X-Robots-Tag, no robots meta, canonical `https://pokemondealfinder.com/deals`, H1 "All deals", SSR "Showing 1–24 of N listings" with 24 tiles and ItemList 24. No region redirect; no load error. `?q=`, `?type=graded&grader=PSA`, `?page=2`, `?country=EBAY_AU` and `?sort=price_asc` return `X-Robots-Tag: noindex, follow` with canonical `/deals`. `?utm_source=` stays indexable with canonical `/deals`. |
| **All deals API**, before vs after (probes 04:30:33Z / 04:32:43Z / 04:34:47Z / 04:35:45Z) | 04:30 and 04:32: Hoopa withheld (identity conflict), 34424 and 37288 listed. The 04:32 probe still served the pre-quarantine 180 s data cache. **04:34:47Z onward: 0 quarantined rows in any scope or filter; Hoopa once as 37856 in all and US, 37861 in GB, absent in IT; withheld 0.** All six marketplace scopes and five filters had summed pages equal to the count, with no duplicates. |
| **Other deal APIs** (`kind=set` xy-promos ± IT, `species` rayquaza graded, `category` graded IT) | Still returned 37863 / 34424 at 04:32 and 04:34 (their own 180 s `fetchDealsPage` data caches). **04:35:45Z: none.** |
| **Sampled cached pages** (`/`, `/best-finds`, `/deals`, `/deals/graded`, `/deals/vintage`, `/deals/under-50`, `/sets/xy-promos`, `/sets/gym-heroes`, `/sets/ex-emerald`, `/pokemon/hoopa`, `/pokemon/tentacruel`, `/pokemon/rayquaza`, `/japanese-cards`) | Before: `/sets/xy-promos` linked 37863; `/pokemon/rayquaza` and `/deals/graded` linked 34424. 04:32: the same (HIT/STALE caches). 04:34: `/sets/xy-promos` regenerated clean; `/pokemon/rayquaza` STALE and `/deals/graded` still linked 34424. **04:35:45Z: no quarantined id linked on any sampled page.** |
| **Production browser**, CDP guard (04:34:19Z) | Clean `/deals`: 24 tiles, All marketplaces selected, uncapped pagination (… 38). Page 2 has no overlap with page 1. Graded filter from page 2 resets the page. Back, forward and reload restore page 2 and the filter. 390 px GB auctions: count shown, no overflow. `?q=hoopa`: one Hoopa tile (37856), "🇯🇵 Japanese · XY-P: XY Promos", Japanese reference, "Price shown from eBay United States · also on eBay United Kingdom"; US 37856; GB 37861; IT: empty state. Guard allowed 0 `/deals/<id>` or `/cards` requests; blocked i.ebayimg.com, impactcdn, PostHog. |

**Two browser check failures, both count drift, not defects:**
- The prerendered `/deals` page-1 HTML said "904 listings" (built at deploy).
- The client-fetched page 2 said "903", because the inventory data cache had refreshed and live rows changed.

A later full crawl of all 38 pages during the 04:35 probe summed to 900 against a first-page count of 902, with no duplicates, because live rows were deactivated mid-crawl. Two back-to-back stable crawls at 04:37:13Z and 04:37:26Z matched exactly: 900 = 900 tiles = 900 distinct, Hoopa once, 0 quarantined. Counts are exact per response; the page-1 HTML can lag the API by up to its revalidation window, and offset pagination reflects live changes between requests.

**Database exclusion vs cached visibility:** the exclusion took effect at apply time (04:32:13Z). Every sampled API and page was clear by 04:35:45Z, through documented expiry: data caches 180 s with one stale serve, and ISR pages regenerated on request. No tag invalidation was triggered. Unsampled ISR pages (for example `/cards/*`, not fetched because the guard blocks them) follow the same gated fetchers; maximum exposure is one 3,600 s ISR window plus one stale serve.

**Rollback location:**
- **Prior values:** `scripts/remediation/applied/language-mismatch-quarantine-prior-2026-09-14T04-32-02Z.json` (3 rows, prior reason NULL, prior `is_active` true).
- **Apply output:** `…/language-mismatch-quarantine-apply-output-2026-09-14T04-32-02Z.txt`.
- **Post-deploy dry run:** `…/language-mismatch-quarantine-dryrun-post-deploy-2026-09-14T04-32-02Z.json`.
- **Command:** `node scripts/remediation/languageMismatchQuarantine.mjs --rollback=scripts/remediation/applied/language-mismatch-quarantine-prior-2026-09-14T04-32-02Z.json --confirm=3`. It restores NULL only where the reason is still present.
- **SQL equivalent:** `supabase/data_corrections/2026-09-14_language_mismatch_quarantine.sql`.
- **Release rollback:** redeploy `dpl_CT3ASTzEiBqhaGSBa3FzYiuB5kbK`.

**Unresolved, explicitly not changed:** four listings still show English comparisons for titles that state "giapponese":

| Row | Card |
|---|---|
| 37466 | Misty's Tentacruel, Gym Heroes |
| 37973 | Skarmory, Neo Genesis |
| 37974 | Bellossom, Neo Genesis |
| 37975 | Togetic, Neo Genesis |

All four come from one German seller (lowil-2781) and carry German-print markers. They were visible in the All deals API (all, IT, `maxPrice=50`) and three were linked from `/deals/vintage` at 04:35:45Z. They are uncertain comparisons, not verified.

**Other issues still open:**
- **Localized-language matcher gap:** the follow-up above.
- **Availability reasons can replace identity quarantines:** this affects the earlier 23-row quarantine and these 3 rows. It is the next bounded follow-up.

Graded optimisation `257e221`, retention and recovery remain inactive. No scanner, allocator, quota, newsletter or social change. **Not every integrity issue is resolved.**

This entry is a local-only commit on `language-quarantine-r1`, **not pushed**.

### Integrity follow-up r2 (2026-09-14): quarantine durability + language review hold (LOCAL, NOT DEPLOYED, NOT APPLIED)

**Scope.** Bounded to two items. No scanner redesign, matcher change, paid call, optimisation, retention or recovery activation.

**A. Availability updates must not replace, and later clear, identity quarantines.**

*Demonstrated path (pre-r2):*
1. `ingest-feed`'s sold-on-lookup write matched `(source, marketplace, listing_id)` + `is_active=true` and set `disqualified_reason = availability:sold` with no reason guard. On an identity-quarantined row that replaced the quarantine.
2. A later discovery sighting marked it `availability:sold:seen_again`.
3. `verify-deals` recovery then selected it as an ordinary candidate and, on a price-matching ACTIVE verdict, reactivated it with `disqualified_reason = NULL`, re-publishing the wrong identity. This is reproduced in IF2-1 on the applied collector-number row 37357.

`verify-deals`' SOLD/ENDED write had the same flaw between reading a candidate and writing.

*Production state (read-only, 04:4xZ):* all 23 collector-number rows and all 3 language rows still carry their identity reasons. The risk is latent, not yet realised.

*Fix:* `lib/listingAvailability.retireForAvailability`, used by both card writers.
- **Statement 1** sets `is_active=false` plus the availability reason only where the reason is NULL or already `availability:*`.
- **Statement 2** sets `is_active=false` (same stamps) without touching the reason, where any other reason is present. This covers identity quarantines, `review:*` holds and quality exclusions.
- Recovery still only selects exact seen-again markers, so a preserved quarantine can never enter it.
- The PostgREST filter shapes (`or(disqualified_reason.is.null, disqualified_reason.like."availability:*")` and `.not(is null)` + `.not(like "availability:*")`) were validated read-only against production.
- Ordinary availability retirement and recovery are unchanged.
- The RETIRED (auction price) path is unchanged.
- **Sealed lane:** not changed. `sealed_deals` currently holds only availability reasons (read-only check).
- **Test harness:** `memoryDb.not(…, "like", …)` now supported.

**B. Reversible review hold for the four uncertain listings.**

Rows: 37466, 37973, 37974, 37975 (EBAY_IT, seller lowil-2781, DE).

- **Mechanism:** `scripts/remediation/languageReviewHold.mjs` plus `language-review-hold-manifest.json` set `disqualified_reason = 'review:language_unverified'`. It asserts no language and changes no identity, `is_active`, price or timestamp.
- **Guards:** the same as the applied quarantines (id, `is_active=true`, reason NULL, listing, marketplace, `card_tcgplayer_id`, `card_language='english'`, title unchanged). `--confirm` must equal the eligible count, and prior values are saved first.
- **Release:** the rollback restores NULL only where the hold is still present.
- **SQL equivalent:** `supabase/data_corrections/2026-09-14_language_review_hold.sql`.
- **Read-only dry run** (`scripts/remediation/language-review-hold-dryrun-2026-09-14.json`): **4 hold, 0 skip**. Expected rows: 4. Prior values: NULL / active.

**Ordering if approved:**
1. Deploy r2.
2. Confirm READY.
3. Dry-run and apply the hold.

The hold is durable only once r2 is live.

**Tests.**

`tests/scanner/integrity-followup-r2.test.mjs`: **13/13**.
- **IF2-1:** the pre-r2 overwrite-then-clear defect, end to end.
- **IF2-2:** all 26 applied quarantined rows survive a feed sold lookup, a sighting and a verifier ENDED/SOLD: retired, reason intact, never a recovery candidate, never displayable.
- **IF2-3:** the read-then-quarantined verifier race.
- **IF2-4:** ordinary rows and recovery unchanged.
- **IF2-5:** quality reasons and review holds are preserved, and non-availability reasons are refused.
- **IF2-6:** both writers are wired to the helper, and no unguarded availability-reason write remains in them.
- **IRH-1 to IRH-7:** hold manifest, plan 4/0, apply and confirm, guards, release, hold durability under r2, and All deals dropping exactly the 4 rows.

**Updated pins:**
- `sold-item-freshness` SIF-18 and SIF-20: the same writes, now through the helper.
- `ebay-14q-quota-optimization` 14Q-8: still passing after restructuring to a single write expression.

**Checks:**

| Check | Result |
|---|---|
| Scanner suite | 3,381 tests: 3,335 pass, **24 fail (identical baseline set)**, 22 skipped |
| `next build` | exit 0 |
| ESLint, changed files | clean |
| `tests/db/*concurrency*` | not run (needs a live Postgres) |

**Still open after r2:**
- The localized-language matcher gap (separate follow-up).
- The four uncertain listings, until the hold is approved and applied, and their print language after that.
- Any identity issue not yet identified.

This commit is local on `integrity-followup-r2`, **not pushed or deployed**.

### Deployment (2026-09-14): integrity follow-up r2 live at `fb5fc6b`; four review holds applied (4/4)

**Authorization.** The owner approved the bounded r2 release and the four review holds, subject to a database concurrency check against disposable local Postgres.

**Concurrency check.** Run before pushing, on disposable local Postgres, never production.

**Setup:**
- Embedded Postgres 17.10 on localhost in the existing scratch harness (`embedded-postgres` + `pg`), created and destroyed per run.
- Repo schema files and both `deals` triggers loaded; READ COMMITTED.

**Method:**
- The conditional writes run as the exact SQL executed for the unmodified r2 code, on separate concurrent connections.
- One transaction is held open, so the other statement genuinely waits on the row lock (asserted via `pg_stat_activity`) and Postgres re-checks its WHERE after commit. Both commit orders were run.
- The translation from code to SQL was captured, not assumed: `retireForAvailability` (feed and verifier call shapes), `applyHold` and `releaseHold` were run against a recording PostgREST client, and all 6 requests' filters and bodies were asserted against the SQL predicates.

**Results:**
- `tests/db/quarantine-durability-concurrency.mjs`: **9/9**.
  - **D1 / D2:** a quarantine committed, or in flight, between the verifier's read and its retirement survives.
  - **D3:** a retirement in flight first makes the guarded quarantine write nothing.
  - **D4:** a feed sold-on-lookup on collector-number, language and review-held rows keeps every reason; a sighting keeps it; the row is never a recovery candidate.
  - **D5:** a hold in flight blocks the feed's replace.
  - **D6:** the pre-r2 statement demonstrably loses the quarantine through seen-again recovery.
  - **D7:** ordinary retirement, marking and recovery still work.
  - **D8:** concurrent feed and verifier retirements serialize without replacing the reason.
  - **D9:** hold apply and release guards hold.
- Existing `tests/db/sold-freshness-concurrency.mjs`: **8/8**.

**D8 correction:** D8 first failed on a wrong expectation. A replace statement cannot wait on a quarantined row, because its committed version already fails the WHERE and Postgres returns 0 rows without locking. The outcome was already correct; the scenario was corrected to test the statements that do contend.

**Limitation:** no PostgREST server ran locally. The captured request filters were validated read-only against production PostgREST earlier the same day.

**Pre-push checks:**
- `fb5fc6b` = `fb5fc6b2fa7eeaa4bef49647da3ecdb4e5711908`.
- `origin/main` was `f544df8`. The range `f544df8..fb5fc6b` was a fast-forward of exactly `844d068`, `d5efd74`, `fb5fc6b`.
- Runtime changes: `lib/listingAvailability.js`, `app/api/ingest-feed/route.js`, `app/api/verify-deals/route.js`.
- `257e221` not in range; `integrity-r1` untouched at `8446e5b`.
- Only `fb5fc6b` pushed (04:56:20Z).

**Vercel:** `dpl_Ek1arNCh8BBBaoY3QmDm8b7BFDEn` built `githubCommitSha` `fb5fc6b…` for production, READY at 04:57:33Z. `pokemondealfinder.com` aliased, no alias error. Rollback candidate: `dpl_29PrxK5LPnD6UjU52kWFu3dCxqmX` (`f544df8`).

**Review holds.** Run after READY from the worktree at `fb5fc6b`; the script and manifest were identical to the commit.

| Step | Result |
|---|---|
| Post-deploy dry run (05:00:29Z) | **4 hold (37466, 37973, 37974, 37975), 0 skip**, exactly the approved set. All active, reason NULL, `card_language` english. |
| Apply (05:00:40Z), `--confirm=4` | **Written 4 of 4; skipped 0; errors 0.** The prior-values file was written before the first update. Only `disqualified_reason` changed, to `review:language_unverified`. No language recorded; identity (`card_language` english; tcgplayer 87552 / 89232 / 83795 / 89939), references, `is_active` and timestamps unchanged. |

**Verification.** Guarded plain GETs of browse pages and `/api/deals-page` only. No provider calls; no retirement was triggered to test anything.

| Layer | Observed |
|---|---|
| **Database** (read-only, 05:00:42Z and again 05:06:23Z) | The 4 holds carry `review:language_unverified`, stay `is_active=true` and **fail the deployed `isDisplayableDeal`**. **All 26 identity quarantines are intact** (23 `identity:collector_number_conflict` + 3 `identity:language_conflict`, all active, none displayable). Japanese Hoopa copies 37856 / 37861 unchanged and displayable. |
| **Pre-hold baseline** (04:59:11Z) | All 4 in the All deals API (all, IT, `maxPrice=50`, IT `maxPrice=50`, `q=giapponese`). 37973 / 37974 / 37975 also in `kind=set` neo-genesis (± IT), `kind=category` vintage IT and under-50 IT, and linked from `/deals/vintage` and `/sets/neo-genesis`. The 3 earlier language quarantines absent everywhere. |
| **All deals API** | **Clear at 05:00:51Z** in every scope and filter, including `q=giapponese` (0). |
| **Other deal APIs** | Still returned 37973–37975 at 05:00:51Z and 05:04:20Z, from 180 s data caches served stale once. **Clear at 05:05:17Z.** |
| **Sampled pages** (`/`, `/best-finds`, `/deals`, `/deals/vintage`, `/deals/under-50`, `/deals/under-25`, `/sets/gym-heroes`, `/sets/neo-genesis`, `/sets/xy-promos`, `/pokemon/tentacruel`, `/pokemon/skarmory`, `/pokemon/bellossom`, `/pokemon/togetic`, `/pokemon/rayquaza`) | 05:00:51Z: `/deals/vintage` and `/sets/neo-genesis` still linked 37973–37975. **05:04:20Z and 05:05:17Z: no held or quarantined id linked on any sampled page.** |
| **Counts** | Stable crawls at 05:04:20Z and 05:05:17Z summed exactly (894 = tiles = distinct). The 05:00:51Z crawl drifted from live changes mid-crawl, the same as observed at 04:35Z. |

**Database exclusion vs cached visibility:** the holds took effect at 05:00:40Z. Cached copies cleared on their documented lifetimes: data caches 180 s plus one stale serve, ISR pages on request. No tag invalidation was triggered. Unsampled ISR pages follow the same gated fetchers; maximum exposure is one 3,600 s ISR window plus one stale serve.

**Rollback / release:**
- **Holds:**
  - Prior values: `scripts/remediation/applied/language-review-hold-prior-2026-09-14T05-00-29Z.json` (4 rows, prior reason NULL, prior `is_active` true).
  - Apply output: `…/language-review-hold-apply-output-2026-09-14T05-00-29Z.txt`.
  - Dry run: `…/language-review-hold-dryrun-post-deploy-2026-09-14T05-00-29Z.json`.
  - Release command: `node scripts/remediation/languageReviewHold.mjs --rollback=scripts/remediation/applied/language-review-hold-prior-2026-09-14T05-00-29Z.json --confirm=4` restores NULL only where the hold is still present and never touches `is_active`.
  - SQL equivalent: `supabase/data_corrections/2026-09-14_language_review_hold.sql`.
- **Code:** redeploy `dpl_29PrxK5LPnD6UjU52kWFu3dCxqmX` (`f544df8`). This only reverts the r2 write guards; it does not touch the data.
- **Earlier quarantines:** unchanged; see their own rollback entries.

**Unresolved, documented separately (not part of this release):**
1. **Print language of 37466, 37973, 37974, 37975.** Their titles say "giapponese" but carry German-print markers. The stored English identity and reference are neither confirmed nor rewritten. They are hidden under a review hold, not resolved. Resolving them needs the item's Language specific or images; then either a reviewed quarantine or a hold release.
2. **Localized-language matcher gap.** `classifyListingLanguage` does not recognise localized language words (Italian giapponese, German japanisch, French japonais, Spanish japonés …), and graded rows skip the display gate's language rule. This needs a separate scanner and matcher change with its own approval. No matcher change was made.

**Not changed:**
- the matcher, scanner, allocator, quota or providers;
- the sealed lane;
- graded optimisation `257e221`, retention, the recovery experiment, newsletter and social.

**Phase closed.** This bounded release is verified. Not every integrity issue is resolved: the two items above remain open.

This entry, `tests/db/quarantine-durability-concurrency.mjs` and the applied hold files are a local-only commit on `integrity-followup-r2`, **not pushed**.
