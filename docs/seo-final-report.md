# SEO implementation — final report

Covers the full 26-phase brief. All code is **deployed to production** and
verified live — `tests/seo/` passes 63/63. The DB index migration is
**applied**. `IMPLEMENTATION_STATUS.md` is the per-phase log; this is the
summary. Related deep docs: `scanning-architecture.md` (deal-scan +
pricing pipeline), `indexability.md` (the `shouldIndex()` rules),
`gsc-readiness.md` (Search Console).

---

## Update — 2026-08-30 · clean `/deals/<category>/` landing routes

Faceted-nav closure (brief Phase 6 + Phase 9): high-intent deal queries
now have **intentional clean routes** instead of relying on
`?maxPrice=50` filter permutations.

- **7 routes:** `/deals/under-25`, `/deals/under-50`, `/deals/under-100`,
  `/deals/graded`, `/deals/auctions`, `/deals/vintage` (1998–2003 WOTC /
  e-Card sets), `/deals/modern` (SV + SWSH era, set list resolved live).
  Plus the `/deals/` index. `/deals/japanese` + `/deals/sealed` → **308**
  to `/japanese-cards` / `/sealed-deals` (which already own that intent —
  no duplicate implementation).
- **`lib/dealCategories.js`** is the single source of truth (slug →
  preset filter + `h1` / `title` / `description` / `intro`).
  **`components/DealCategoryPage.js`** renders page 1 server-side then
  hands off to the existing `<DealGrid kind="category">` for
  filters/pagination — no new deal logic, reuses `DealCard`,
  `SiteHeader/Footer`, `Breadcrumbs`. Dispatched from
  `app/deals/[id]/page.js` by a 3-line guard (a real deal id is numeric,
  a category slug never is); category slugs are in `generateStaticParams`
  so they prerender.
- **Canonical:** each route self-canonicals to `/deals/<slug>` (params
  stripped); `FilterBar` links stay `rel="nofollow"` — same faceted-nav
  protection `/sets/[slug]` already has.
- **Internal linking:** nav "Graded" / "Auctions" repointed from
  `/?type=graded` / `/?listing=AUCTION` (renderer-nofollowed) to the new
  clean routes; "Deals by Price" added to the Browse menu; all 8 routes
  added to the pages sitemap.
- **Not built:** per-entity `/market-data/charizard-prices/` style pages
  — `/pokemon/charizard` already *is* that landing page; a second URL
  for the same intent is keyword cannibalisation / doorway-adjacent,
  which the brief itself forbids (Phase 8).
- `test:seo` **63/63** (6 new `/deals/*` checks), `test:scanner` 11/11,
  build clean. Filters verified: `under-50` caps at $50, `graded` all
  `is_graded`, `vintage` only WOTC/e-Card sets, a looser user `?maxPrice`
  is clamped to the band ceiling.

---

## Update — 2026-08-29 re-audit pass (commits `94e9a33` … `e12bfc7`)

A fresh live crawler-HTML audit after the currency / country-catalog /
variant-matching work, plus GSC setup (sitemap index parsed, 6,132 URLs
discovered, 0 errors). What changed:

- **Structured data** — 10 pages had **no JSON-LD at all**
  (`/market-data*`, `/best-finds`, `/japanese-cards`, `/sets`, `/pokemon`,
  `/sealed-deals`, `/sealed-deals/[id]`, `/search`). All now emit
  `BreadcrumbList` + `CollectionPage` / `ItemList` / `SearchResultsPage`
  via `lib/jsonLd.js` + `components/JsonLd.js`. Card-hub breadcrumb went
  flat 2-level → 3-level (`Deals → set → card`). `tests/seo` now asserts
  a `BreadcrumbList` on every indexable page.
- **Edge caching restored** — the currency + region work read the geo
  header during render, forcing every card / deal / set / species page to
  `Cache-Control: no-store` (full uncached Supabase render per crawler
  hit). Fixed by moving currency + region resolution fully client-side
  (`CurrencyProvider` + `<Price>` islands; `/api/rates`) and making the
  detail routes ISR:
  - `/cards/[slug]`, `/deals/[id]`, `/sealed-deals/[id]` —
    `generateStaticParams: []` + `revalidate` (no request-time APIs).
  - `/sets/[slug]`, `/pokemon/[slug]` — page 1 server-rendered, filters +
    pagination moved to a client `<DealGrid>` (reads
    `window.location.search`, **not** `useSearchParams`, which would blank
    the grid for crawlers) hitting a new `/api/deals-page`.
  - **Verified live: `X-Vercel-Cache: HIT` on ~6,100 pages** — the whole
    crawlable long tail — that were `MISS` / `no-store`. Only `/`,
    `/best-finds`, `/japanese-cards`, `/sealed-deals` (4 filtered-grid
    URLs) remain dynamic.
- **Metadata / freshness** — `/cards/[slug]` H1 now carries set + intent
  (`"Zapdos — Base Set Prices & Deals"`, was bare `"Zapdos"`);
  `/market-data*` show a real "Data last updated" timestamp +
  `dateModified`. The `?page=N` self-canonical series on set / species
  pages is gone (churny lists don't rank; the sitemap enumerates deals
  directly).
- **Crawl budget** — `rel="nofollow"` on every filter / sort link and the
  `?type=` / `?listing=` nav entries; `SET_MIN_LISTINGS` 1 → 3 (thin
  1–2-deal set pages 404 and leave the sitemap); fixed a
  `/sitemaps/deals.xml` duplicate-`<loc>` bug.
- **Internal linking** — `/cards/[slug]` gained "Other <species> cards" +
  "More from <set>" link lists (card ↔ card; was card → set/species/deals
  only).
- **Re-verified, unchanged** — Pokémon extraction (95.7% name / 98.6%
  deal-row coverage, no false positives); affiliate outbound
  (`rel="sponsored noopener noreferrer"`, per-marketplace EPN params, no
  dark patterns).

---

## Update — 2026-08-29 SEO levers pass (commits `2c91cf1` … `fe39443`)

Three targeted levers, done in order:

**Lever #1 — card-page price/value framing — DONE.** `/cards/[slug]` now
leads (directly under the H1) with `components/CardPriceSummary`:
**Market value (raw, Near Mint)** as a labelled PokémonPriceTracker
reference from sold data; the **raw by-condition ladder**; **graded
tiers** from real recorded sold sales with per-tier counts. It only
renders data the DB actually holds — the condition ladder is suppressed
when it isn't a sane non-increasing sequence (cards with contaminated
data, e.g. Shadowless Alakazam, show the NM headline + graded only, no
"Damaged > Near Mint" rows); graded tiers need ≥ 1 real sale;
low-confidence tiers are labelled. The former bare "From $X – $Y" (which
read as a market value) is re-framed to "N active listings, from $X
**(asking prices, not sold)**". Title → `"<name> (<set>) Price & Deals"`;
description leads with price + value. `gradeLabel()` fixed for half
grades. The variant grid, price history, deals grid, related links,
`Product`/`Offer` + `BreadcrumbList` JSON-LD, canonical, indexability and
affiliate CTAs are all unchanged and still below. `/cards/[slug]` stays
SSG; verified live across vintage / modern / cheap / contaminated-data
cards.

**Lever #2 — more market-data pages — MEASURED, NOTHING BUILT.** The site
keeps **no price time series of its own**: `deals.price_change_24hr` is
100 % null, `deals` history spans ~2 days, there's no `price_history`
table. So "biggest movers" is impossible without weeks of new data
collection. "Vintage prices" duplicates `/market-data/most-expensive-
cards`. "Japanese market data" is thin (247 priced cards, mostly $10–50,
overlaps `/japanese-cards`). Per the brief's "if borderline, don't build"
rule, **built none**; documented the measurement and the future
`price_history`-table option in `IMPLEMENTATION_STATUS.md`.

**Lever #3 — remaining dynamic routes — REVIEWED, LEFT DYNAMIC.** `/`,
`/best-finds`, `/japanese-cards`, `/sealed-deals` serve `no-store` (TTFB
~350–520 ms). But they're 4 individual URLs (no crawl-budget impact,
already "Good" CWV), and the `<DealGrid>` pattern doesn't generalise
cleanly to their different fetchers + page-1 shuffle + best-finds
ranking. "Safe **and** straightforward" isn't met, so left dynamic
deliberately; the homepage is the one to revisit if CrUX later flags its
LCP.

---

## 1. What changed

### Already live (Phases 1–4, 6, 7, 9–17, 19 audit + first build pass)

Audit; URL architecture; `/deals/[id]` + `/cards/[slug]` card hubs (fix
for a real duplicate-content problem — 69% of watched cards had 2+
simultaneous listings); `/sets` + `/sets/[slug]`; the grid pages (`/`,
`/best-finds`, `/japanese-cards`, `/sealed-deals`) paginated + filterable;
`/market-data/*`; per-page metadata + self-referencing canonicals;
`Product`/`Offer` + `BreadcrumbList` + `FAQPage` + `WebSite` +
`Organization` JSON-LD; `unstable_cache` data layer (fixed a real
3.25 s → sub-second regression); image SEO; affiliate disclosure in
every footer.

### Built this pass (not yet deployed)

| Phase | Change |
| --- | --- |
| **5 — Pokémon entity pages** | `/pokemon` + `/pokemon/[slug]` (~220 pages). Aggregates every active deal for a species across all its prints. `lib/pokemonSpecies.js` maps catalog-clean card names → National Dex species (94.7% of distinct names resolve; the rest are trainer/energy singles that correctly get no page). `BreadcrumbList` + `ItemList` JSON-LD, **no `Product`** (a species isn't one item). Threshold `SPECIES_MIN_LISTINGS = 5`. |
| **18 — Trust/methodology** | `/about`, `/how-it-works`, `/methodology`, `/affiliate-disclosure`, `/contact`. Every claim traceable to real code/config; no invented numbers. `components/SiteFooter.js` replaces 7 copy-pasted footer variants and links all trust + guide pages site-wide. |
| **20 — Editorial** | `/guides` + 4 evergreen guides (pricing, condition/grading, raw vs graded, vintage vs modern). Fixed set, not a blog. `Article` + `BreadcrumbList` JSON-LD. |
| **12/15 — Sitemaps** | `/sitemap.xml` is now a **sitemap index** → six per-type child sitemaps at `/sitemaps/<segment>.xml` (`lib/sitemap.js` + route handlers; Next's `generateSitemaps` produces children but no index). |
| **21 — Indexability** | `docs/indexability.md` + `lib/indexability.js` (`CARD_HUB_MIN_LISTINGS`, `SET_MIN_LISTINGS`, `SPECIES_MIN_LISTINGS` as named constants; `shouldIndexDeal()` backs the deal-detail checks). |
| **22 — DB performance** | `count: "exact"` → `"estimated"` on the category-page queries (removes a full filtered `COUNT(*)` per request). Index migration written (**blocked** — see §5). |
| **23/24 — CI SEO tests** | `tests/seo/` — 40-check zero-dependency `node:test` suite + `.github/workflows/seo-tests.yml`. Caught & fixed two real pre-existing bugs (homepage had **no `<title>` tag**; deal-detail titles could hit 92 chars). |
| **eBay 429** (operational) | `getBrowseRateLimit()` pre-flight guard on both scan crons + volume trims. `docs/ebay-rate-limits.md`. |

---

## 2. Final URL architecture

```
/                                  home / all-deals grid (+ ?page=N, ?type=, ?country=, ?listing=, ?minPrice=, ?maxPrice=)
/best-finds                        top raw + graded finds
/sets            /sets/[slug]      browse by set
/pokemon         /pokemon/[slug]   browse by Pokémon (species aggregate)      ← Phase 5
/cards/[slug]                      exact-print hub ("N sellers, compare prices")
/deals/[id]                        one eBay listing
/japanese-cards                    Japanese-catalogue grid
/sealed-deals    /sealed-deals/[id]  sealed product
/market-data     /market-data/most-listed-cards  /market-data/most-expensive-cards
/search                            on-site search (noindex,follow)
/guides          /guides/[4]       editorial                                  ← Phase 20
/about  /how-it-works  /methodology  /affiliate-disclosure  /contact          ← Phase 18
/sitemap.xml → /sitemaps/{pages,sets,pokemon,cards,deals,sealed-deals}.xml    ← Phase 12
/robots.txt
```

Adapted from the brief's example paths per its own instruction: no
`/pokemon-card-prices/` (would duplicate `/`), no separate `/graded/` /
`/auctions/` routes (existing `?type=` / `?listing=` filters cover the
intent without new URLs), no separate `/price-history/` (integrated into
card-hub and deal pages).

---

## 3. Indexable vs non-indexable

Full rule + per-type table: **`docs/indexability.md`**. Summary:

| Indexable | Not indexed |
| --- | --- |
| `/` and all listing indexes | `/search?q=…` (`noindex,follow`) |
| Trust pages, `/guides` + guides | Filtered/paginated variants (`?type=`, `?country=`, `?page=2`) — canonicalise to base |
| `/sets/[slug]` (≥1 active deal) | Sub-threshold card hubs / species → **404** (not generated) |
| `/cards/[slug]` (≥2 simultaneous listings) | Expired `/deals/[id]` / `/sealed-deals/[id]` → 200 + `noindex` "expired" body |
| `/pokemon/[slug]` (≥5 active listings) | Bogus dynamic slugs → **404** |
| `/deals/[id]`, `/sealed-deals/[id]` while `is_active` | `/api/*` (robots-disallowed) |

No empty 200s, no faceted-URL bloat, no thin/near-duplicate pages —
asserted by `tests/seo/negative.test.mjs`.

---

## 4. Approach summary

- **Metadata** — every page has a unique title (distinctive part kept
  near 60 chars; site-name template appended), a real description, and a
  self-referencing absolute canonical. Pagination canonicals are
  self-referencing (`?page=N`), never collapsed to page 1. Explicit
  `openGraph` **and** `twitter` blocks on every page (Next doesn't derive
  one from the other).
- **Structured data** — `Organization` + `WebSite`+`SearchAction` (home);
  `BreadcrumbList` everywhere with a hierarchy; `Product`/`Offer` only on
  genuine single-item pages (`/deals/[id]`, `/sealed-deals/[id]`,
  `/cards/[slug]`); `ItemList` on `/pokemon/[slug]` and `/guides`;
  `FAQPage` on `/`; `Article` on guides; `AboutPage`/`ContactPage` on
  those. No invented ratings, reviews, or `hasMerchantReturnPolicy`
  (varies per eBay seller).
- **Sitemaps** — index + six real-data child sitemaps, 200/canonical/
  indexable URLs only, capped where inventory churns.
- **Internal linking** — DealCard → set + species; `/cards/[slug]` &
  `/deals/[id]` → species page; homepage → top card hubs; `/sets` &
  `/pokemon` indexes → every detail page (crawlable `<a>`, server-
  rendered); site-wide footer → trust + guide pages; guides →
  `/methodology`, `/sets`, `/market-data`, each other. `BreadcrumbList`
  JSON-LD mirrors the visible hierarchy.
- **Crawl control** — `robots.txt` allows all but `/api/`, declares the
  sitemap. No crawlable links to arbitrary filter permutations; only the
  real `?page=N` series (capped at `MAX_LIST_PAGES`).

---

## 5. Performance & DB

- **Web Vitals** (Speed Insights, live): TTFB p75 ~50–90 ms, LCP p75
  ~1.2–1.6 s, CLS 0 — all in Google's "Good" band. The
  `unstable_cache` data layer is what keeps TTFB low despite every page
  reading Supabase.
- **`COUNT(*)` removed** from `/sets/[slug]` and `/pokemon/[slug]`
  pagination (`estimated` count) — live.
- **N+1:** none. Every fetcher is one query (or a bounded 1000-row
  paginated group-in-JS scan); joins are in a single `select`.
- **Six indexes applied** (`supabase/seo_perf_indexes_migration.sql`, all
  `CREATE INDEX CONCURRENTLY`): `deals (watchlist_id)` — a foreign key
  that had no index, so every `/cards/[slug]` and every species
  `.in(watchlist_id,…)` query was full-scanning ~16.5k rows;
  `deals (is_active, first_seen_at desc)`,
  `deals (is_active, last_seen_at desc)`,
  `deals (is_active, market_price desc)`, a partial auction index, and
  `watchlist (language, "set")`.

---

## 6. Remaining work — blocked on something outside the code

| Item | Needs |
| --- | --- |
| **`/contact` mailbox** | `pokemondealfinder@gmail.com` must actually be monitored (it's published site-wide) |
| **CI secrets** | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` added to GitHub Actions for `.github/workflows/seo-tests.yml` |
| **eBay rate-limit increase** | Request in the eBay Developer portal — 5,000/day default is the real cause of the 429s (`docs/ebay-rate-limits.md`) |
| **GSC** | Follow `docs/gsc-readiness.md` — submit `/sitemap.xml`, seed URL inspection, watch the reports |

---

## 7. Deliberate non-goals (documented, not oversights)

- No `/cards/[slug]/price-history/` route — history is on the card-hub and
  deal pages; PokémonPriceTracker doesn't expose enough depth to justify a
  separate crawlable page.
- No redirect/410 infrastructure — slugs derive from live data, not stored
  values, so they only change if the derivation logic does. 404 via
  `notFound()` is already correct everywhere.
- No `hreflang` — one language, five marketplaces behind a `?country=`
  filter on the same URLs.
- Editorial capped at 4 guides — the brief's "not bulk blog filler".
