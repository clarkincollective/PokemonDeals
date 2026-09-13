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

## Deal-first premium overhaul — R0–R2 BUILT LOCALLY (not deployed) — 2026-09-13

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
