# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pokemon trading-card buyers evaluating a purchase decision. Four confirmed
audiences, all primary:

- **Deal-hunting collectors** — want a specific card or sealed product for
  their own collection and do not want to overpay; browse by Pokemon,
  set, or exact card and catch a good price.
- **Resellers / flippers** — arbitrage: buy underpriced, resell higher.
  Care about margin, speed, raw-vs-graded spread, and auctions ending
  soon.
- **Investors** — hold cards as appreciating assets; care about market
  aggregates, value distribution, and pricing over time.
- **Search-driven visitors** — arrive from a search engine on a query
  like "`<card>` price" or "`<card>` deal" and land directly on a card,
  set, or Pokemon page. Organic search is a primary acquisition channel,
  so most pages must stand alone for someone with no prior context.

## Product Purpose

Pokemon Deal Finder is a free tool that continuously scans live eBay
listings for Pokemon single cards and sealed products across six
marketplaces, independently re-verifies each one, matches it to the exact
card printing, and shows only the listings priced meaningfully below their
real market value. Below-market is measured against recent sold-listing
data — per condition for raw cards, sold graded comps for slabs — not a
single estimated number.

It exists because finding a genuinely underpriced listing on eBay by hand
means running dozens of searches across marketplaces and conditions and
still not knowing whether the asking price is actually low. The tool does
that comparison automatically and only surfaces the results it can stand
behind.

Success is a visitor finding a real underpriced listing for a card they
care about and clicking through to buy, trusting that the price comparison
is genuine.

## Positioning

Four confirmed differentiators future work must protect:

- **Verified, not scraped.** Every listing is independently re-fetched via
  the site's own eBay Browse API access and run through strict
  identity matching — card count, language, grade, and exact printing must
  all reconcile apples-to-apples with the reference card — plus
  seller-trust and price-sanity gates. A listing that cannot be reconciled
  is dropped, never shown with a guess.
- **Real sold-comp pricing.** "Below market" is anchored to real recent
  sold-listing data, per condition for raw cards and sold graded comps for
  slabs — not one fabricated market price.
- **Free and transparent.** Free to the user, affiliate-funded, no paid
  placement, full published methodology, no fabricated reviews, stats, or
  urgency.
- **Multi-marketplace and live.** Six eBay marketplaces (US, GB, AU, CA,
  DE, IT), viewer-currency conversion, and continuous re-verification so
  stale or sold listings drop out quickly.

## Operating Context

- **Data sources:** eBay Browse API and PokemonPriceTracker. These two,
  named on `/methodology`, are the only pricing/listing sources.
- **Scan cadence:** cron-driven — a priority tier several times a day, a
  broader sweep, amortised extended chunks, and a daily sealed-product
  scan. Each run is quota-guarded against the eBay Browse daily limit with
  a pre-flight floor check per scan type.
- **Card identity:** listings are matched against an internal
  `card_catalog`; the exact-printing key is `card_tcgplayer_id`.
- **Trust / sanity gates (from `lib/dealMatching.js`, `lib/dealQuality.js`):**
  minimum 10% below reference to qualify (`DISCOUNT_THRESHOLD = 0.1`), a
  25% sanity floor (`SANITY_FLOOR_PCT`), seller feedback ≥ 95% and score
  ≥ 10, a 1st-Edition/Shadowless guard, and fail-closed handling of
  multi-card lots, non-matching language, and non-matching grade.
- **Affiliate model:** eBay Partner Network (with per-sub-ID `customid`
  attribution) plus TCGPlayer via Impact.com. Every outbound buy link is
  `rel="sponsored"`. No price change to the buyer, no paid placement.
- **Viewer currency / region:** resolved client-side after hydration so no
  indexable page reads request headers during render (SEO / caching
  constraint).
- **Newsletter & price alerts:** stored in Supabase
  (`newsletter_subscribers`, `price_alerts`), double-opt-in, weekly digest
  cron.
- **External discovery ingestion:** public eBay item IDs from the
  PokeDealFinder public board are used as discovery *hints only* (operator
  represents having permission); every item is then re-fetched and
  re-validated through this site's own pipeline, matched to this site's
  catalog, and wrapped with this site's own affiliate links. No external
  affiliate link, tracking param, branding, or content is imported.
- **Social content production (Phase 13E):** a local-only tool
  (`npm run social:daily` / `social:assets`) that produces reviewable
  post drafts. It has no publishing path, no platform API, and makes no
  generative-AI call in the daily loop.

## Capabilities and Constraints

- **Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Supabase
  (Postgres + RLS), deployed on Vercel. `next/font` (Geist).
- Server-rendered pages, self-referencing canonicals, a sitemap index with
  segmented child sitemaps, per-page structured data.
- **eBay Browse API** is on the default 5,000-calls/day tier and is the
  binding rate constraint; the batch `getItems` endpoint 403s on this
  keyset, so external-item verification costs one Browse call per item.
- Six marketplaces, each with its own currency and affiliate rotation ID.
- **Spelling:** always "Pokemon" (ASCII), never "Pokémon" with the accent
  — in UI, copy, and metadata.
- **No affiliation** with The Pokémon Company, Nintendo, Game Freak, or
  Creatures Inc., and nothing in the product may imply one.
- Price history depth is limited to what PokemonPriceTracker exposes;
  there is no separate crawlable price-history page beyond the chart shown
  on card and deal pages (deliberate).

## Brand Commitments

- **Name:** "Pokemon Deal Finder"; domain `pokemondealfinder.com`.
- **Logo:** a magnifying-glass mark — a stroked circle with a handle —
  drawn in a red gradient (`#FF6B5B` → `#DC2626`). Wordmark sets "Pokemon"
  in red and "Deal Finder" in black (near-white on dark).
- **Voice:** factual, present-tense, no hype. No fake scarcity or urgency
  ("only N left", "hurry", "won't last", "buy now"); no superlatives; no
  invented testimonials, stats, or benchmarks. Every claim must be
  traceable to real code or config — the same bar as the homepage trust
  badges.
- **Listing framing:** "Live eBay listing" / "eBay listing", never "our
  listing", "we're selling", or any ownership/authenticity guarantee.
- **Affiliate disclosure** appears in every page footer and on a dedicated
  `/affiliate-disclosure` page; the approved social disclosure label is
  "Ad".
- **Fonts:** Geist Sans and Geist Mono.
- **Contact:** `pokemondealfinder@gmail.com`.

## Evidence on Hand

- **Live production data:** on the order of 16k active deal rows, ~175
  sets with an active deal, 223 Pokemon species pages, ~976 card hubs,
  ~62 sealed deals. Real per-card price-history charts from
  PokemonPriceTracker.
- **Real performance data** (Vercel Speed Insights): TTFB p75 ≈ 53–92 ms,
  LCP p75 ≈ 1.2–1.6 s, CLS 0.
- **Published, code-traceable content:** `/about`, `/how-it-works`,
  `/methodology`, `/affiliate-disclosure`, `/contact`, plus four evergreen
  editorial guides under `/guides`.
- **Social:** a local review gallery and a brand-background asset library
  (30 planned, 3 generated, 0 approved as of 2026-09-06).
- **Absent — must not be fabricated by future work:** there are no
  customer testimonials, named customers, press mentions, review counts,
  star ratings, user/traffic numbers, or third-party endorsements. None
  may be invented for any surface.

## Product Principles

1. **Never surface a listing the site can't stand behind.** Wrong-card,
   wrong-variant, wrong-language, wrong-grade, untrusted-seller, and stale
   listings fail closed — they are dropped, never shown with an
   approximation.
2. **Every number is real and traceable.** Market values and discounts
   come from actual sold comps; ratings, urgency, and social proof are
   never fabricated to fill a slot.
3. **Free and transparent.** Affiliate-funded, no paid placement,
   methodology fully public, disclosure on every page.
4. **Performance and crawlability are product features**, not
   afterthoughts — server-rendered, self-canonical, Core Web Vitals in
   Google's "Good" band, no render-blocking geo/currency work.
5. **The buyer's trust is the asset.** Factual voice, honest "live eBay
   listing" framing, and no implied affiliation with Pokémon/Nintendo/TPCi.
