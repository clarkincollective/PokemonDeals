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

## Not building (deliberate, documented)

- **Phase 8 — dedicated price-history pages**: not building as separate `/cards/[slug]/price-history/` routes — price history is already integrated into the card hub and deal detail pages (chart + real data), and PokemonPriceTracker doesn't expose enough historical depth to justify a separate crawlable page beyond what's already shown. Documenting this as a deliberate scope decision, not an oversight.
- **Phase 23 — 404/410/redirect infra**: 404 (`notFound()`) already correct on all dynamic routes. No redirect/410 infrastructure built — slugs are derived from live data, not stored, so they only change if the derivation logic itself changes, which hasn't happened. Documenting as a deliberate "not needed given current architecture" rather than building unused speculative code.

## Known operational issue (unrelated to SEO code)

**eBay Browse API 429s — diagnosed 2026-08-28.** Not a mysterious block: eBay's Developer Analytics `getRateLimits` confirms the app is on the **default `buy.browse` tier of 5,000 calls/day** and spends the whole allocation (usually by mid-day), after which every search 429s until the ~07:00 UTC reset. Full write-up + the daily call budget in **`docs/ebay-rate-limits.md`**.

Mitigations applied (deploy pending): **pre-flight quota guard** — `getBrowseRateLimit()` in `lib/ebay.js`; both scan routes skip the run (`{ skipped: "ebay_rate_limited" }`) when live `remaining` is below a tier-aware floor (extended yields at 1500, priority 600, sweep/sealed 250) so the daily budget can no longer be *overrun* and the cheap user-facing sweep is protected. Plus volume trims in `vercel.json` (non-US sweeps hourly→3h, priority 4h→6h, sweep `GRADED_LOOKUP_CAP` 10→6) and a transient-only retry (`fetchWithRetry` — never retries a 429). Typical daily spend now ~2,600–3,400.

**Real fix (process, not code):** request a Browse API rate-limit increase in the eBay Developer portal — the app's affiliate use is exactly the intended Buy-API case. See the doc.

Does not affect any SEO-page code; existing active deals serve normally via the rotation pool regardless.
