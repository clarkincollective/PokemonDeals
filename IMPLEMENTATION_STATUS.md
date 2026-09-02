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
