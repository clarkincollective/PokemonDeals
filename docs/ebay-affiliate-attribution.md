# eBay affiliate sub-ID attribution (EPN customid / affiliateReferenceId)

Implements the one zero-new-access opportunity found by the eBay Developer
capability/quota audit (2026-09-05): the app already sends
`affiliateCampaignId` on every outbound eBay link, but `customid`
(EPN's sub-ID / eBay's `affiliateReferenceId`) was always blank, so EPN
reporting had no way to tell which part of the site generated a click.

> **SUPERSEDED FROM 2026-09-25 BY THE FINDING 5 SECTION AT THE END OF THIS
> FILE.** Everything above that section describes the single-token
> `customid` vocabulary EPN recorded BEFORE that date. It is kept because
> archived EPN rows still carry those values. The live contract is
> `lib/affiliateAttribution.js`.

## The allowed surface enum

`lib/affiliateSurfaces.js` exports `AFFILIATE_SURFACES`, the complete,
fixed list:

```
home_best, home_auction, home_all, home_just_added, best_finds, deals,
auctions, search, pokemon, set, card, deal_page, recently_viewed, other
```

This is the **only** set of strings that can ever reach eBay's `customid`
param. `affiliateSurface(value)` is the single function allowed to decide
that - anything not on the list (including `undefined`, a typo, or a
caller mistake) resolves to `"other"`, never a guess and never the raw
value.

`auctions` and `recently_viewed` are reserved for future use - no current
render path maps to them yet (there is no dedicated `/deals/auctions`
route, and the "recently viewed" strip currently only links to
`/cards/[slug]`, not directly to eBay).

## Privacy rule

`customid` is a coarse **product surface** label only. It must never
carry, and this module structurally cannot produce: a user/session/
PostHog identity, a search query, a card/Pokemon/set name, a card ID, a
deal ID, a listing ID, a TCGplayer ID, a price, or a country/marketplace
code. The allowlist is a closed `Set` of literal strings - there is no
code path that concatenates a caller-supplied value into the surface
string, so none of the above can leak in even by mistake.

## How it's wired: reusing `pageName`, not inventing a second prop

The site already threads a `pageName` prop through `DealCard`,
`SealedDealCard`, `SpeciesCard`, and `DealGrid` for existing Vercel
Analytics / PostHog page-type context (`"home_best"`, `"card_hub"`,
`"species_detail"`, ...). `surfaceForPageName(pageName)` is a lookup
table (`PAGE_NAME_TO_SURFACE`) mapping that existing, more granular
internal vocabulary onto the public EPN enum. This is a one-line addition
at each component that already receives `pageName` - no second parallel
prop was invented, and `pageName` itself is a coarse page-TYPE label
(never a user/session/card identity), so reusing it here crosses no
privacy boundary.

For components not reachable via `pageName` (search-result rows, variant/
condition grids, catalogue tiles), `wrapEbayAffiliateUrl(url, { surface })`
and `buildEbaySearchLink(query, marketplace, surface)` take an explicit
`surface` argument threaded from the page that has real context.

## Render-time rewrite, not scan-time

`deals.affiliate_url` is written **once**, by the scanner, at discovery
time - there is no user-facing surface yet at that point (see
`authHeaders()`'s own comment in `lib/ebay.js` for why
`affiliateReferenceId` is deliberately never sent on Browse API scan
requests). Every page that later shows that same stored deal calls
`wrapEbayAffiliateUrl(deal.affiliate_url, { surface })` again, right
before rendering the CTA, with its own real surface - so the identical
stored URL correctly carries a different `customid` on the homepage vs.
`/search` vs. a card hub. `wrapEbayAffiliateUrl` uses
`URLSearchParams.set()` (never `.append()`) for every param it manages,
so re-wrapping an already-wrapped URL is always idempotent: exactly one
`customid`, one `campid`, one of everything else, however many times a
link happens to be re-wrapped.

## Mapped surfaces (representative, not exhaustive)

| Route / component | pageName / explicit surface | EPN surface |
|---|---|---|
| `/` Best Deals | `home_best` | `home_best` |
| `/` Auctions Ending Soon | `home_ending` | `home_auction` |
| `/` All Deals | `home_all_deals` | `home_all` |
| `/` Just Added | `home_fresh` | `home_just_added` |
| `/best-finds` | `best_finds` | `best_finds` |
| `/deals` | `deals_index` | `deals` |
| `/search` | `price_checker` (DealCard) + explicit `"search"` (search-result rows) | `search` |
| `/pokemon/[slug]` | `species_detail` / `species_catalog` / `species_card` / explicit `"pokemon"` | `pokemon` |
| `/sets/[slug]` | `set_detail` / `set_detail_sealed` / explicit `"set"` | `set` |
| `/cards/[slug]` | `card_hub` / explicit `"card"` | `card` |
| `/deals/[id]` | explicit `"deal_page"` (main CTA, sticky CTA, condition breakdown, expired-deal fallback) | `deal_page` |
| `/sealed-deals/[id]` | explicit `"deal_page"` | `deal_page` |
| `/japanese-cards`, `/sealed-deals` index, sealed hub tiles | `japanese_cards` / `sealed` / `sealed_hub` (not in the table) | `other` (honest fallback, no dedicated surface requested for these) |

**Deliberately left at `other`** (not threaded further): a small number of
`ebayHref`/recent-sold-comp links built deep inside the shared, cached
`lib/deals.js` catalogue-aggregate functions and `lib/pokemonPriceTracker.js`'s
`normalizeSoldListings` - both are reused identically across multiple page
types and adding per-call surface context there would mean changing
`unstable_cache`-keyed function signatures shared by code explicitly
marked "must not regress". `other` is the correct, honest answer for a
link whose surface genuinely isn't confidently known at that layer - not
a gap to silently paper over.

## Relationship to PostHog

Kept strictly separate, by design:

- **PostHog**: product behavior / qualified actions, keyed by whatever
  identifiers the existing analytics posture already allows (see
  `docs/` analytics posture doc). Unaffected by this change - the same
  `pageName`/`analyticsProps` plumbing is only ever *read*, never written
  to, by `affiliateSurfaces.js`.
- **EPN `customid`**: affiliate revenue by coarse surface, visible only in
  eBay's own EPN reporting.

No individual identifier crosses from one system to the other, and the two
vocabularies are not the same strings even for the same surface: PostHog's
`origin_section` for the homepage flagship row is `best_deals` (see
`docs/deal-first-measurement.md` §1 for the full PostHog/Vercel/EPN
mapping), while this module's EPN `customid` for that same surface is
`home_best`. Similar-looking names, two different systems - comparison of
aggregates (e.g. `best_deals` clicks in PostHog vs. `home_best` EPN
clicks/revenue) is possible without ever joining on a user/session, but
never assume the section name is identical across the two.

## PostHog `affiliate_click` dimensions (2026-09-19, growth brief §11)

**Emitters (2026-09-20).** Two components emit `affiliate_click`:
`components/AffiliateLink.js` (every listing / TCGPlayer / grid link) and,
since `797d9cb`, `components/EbaySearchLink.js` (the "Search current eBay
listings" control on catalogue card pages and other eBay-search surfaces).
The search control sends `placement` and `origin_section` from its caller's
`event.placement` (`card_no_deal` on card pages), `network: "ebay"`,
`page_type` from the path and `country` from the chosen marketplace; the
Vercel `eBay Click` event it always sent is unchanged. One event per system
per click. Note that the PostHog origin `card_catalog` is the **"Check on
TCGPlayer"** link on the catalogue render (network `tcgplayer`), not the
eBay search. Controlled wiring checks load the page with
`?utm_source=pdf_verification`; `npm run report:growth` excludes that
marker from every query.

`components/AffiliateLink.js` now adds three structural properties to the
`affiliate_click` event, alongside the existing `origin_section`:

| Property | Values | Source |
|---|---|---|
| `page_type` | `lib/analytics/pageType.js` PAGE_TYPES (`card`, `deal`, `set`, `hub`, `saved`, …) | the current pathname, at click time — never the path or an id |
| `placement` | an explicit `analyticsProps.placement`, else the existing `eventData.page` label (`sticky_cta`, `detail`, `variant_grid`, `condition_breakdown`, `card_hub`, a grid's `pageName`, `expired_deal`, …) | the control that was clicked |
| `network` | `ebay` / `tcgplayer` | derived from the Vercel event name; EPN and TCGPlayer are never summed |

Reporting view: `npm run report:growth [--from --to --json]`
(`scripts/reporting/growthReport.mjs`, read-only HogQL through the same
credential path as the homepage report) prints affiliate clicks per 1k
page views by network × page type, the full network × page type ×
placement × origin section table, and the saved / alert loop counts.
Events captured before 2026-09-19 carry neither `page_type` nor
`placement`; the report labels them `(pre-2026-09-19)` rather than
back-filling. Commission remains EPN / Impact dashboard data at the
granularity those programmes support; `customid` is unchanged.

## Fallback behavior

If a surface is missing, invalid, or not on the allowlist,
`affiliateSurface()` returns `"other"` - the affiliate destination and
every other tracking parameter (`campid`, `mkevt`, `mkcid`, `mkrid`,
`toolid`) are always preserved regardless. Attribution being unavailable
never removes or breaks the actual outbound link.

## No API/quota impact

This is metadata on already-existing outbound links only:

- No new Browse API call, no new OAuth scope, no new eBay API.
- `authHeaders()` (the Browse scan-time request headers) is unchanged -
  see its own comment for why.
- Zero eBay quota impact of any kind.

## No EPN business-model change

The user still sees a normal comparison-site page and clicks a normal
outbound "Check deal on eBay" link that opens in a new tab
(`target="_blank"`, `rel="sponsored noopener noreferrer"`, unchanged).
`affiliateReferenceId` is attribution metadata on that same link - no
redirect, no auto-forwarding, no hidden click, no incentive, nothing that
changes what the visitor sees or does.

---

# FINDING 5 (2026-09-25) — the live attribution contract

`lib/affiliateAttribution.js`. Everything above this line is the historical
vocabulary; this section is what outbound links carry now.

## What was measured, before changing anything

A census of the **rendered production HTML** on 2026-09-25. The script
(`scripts/integrity/verifyAffiliateAttribution.mjs`, read-only) fetches
page HTML and inspects hrefs; it never requests an `ebay.com` or
`partner.tcgplayer.com` URL, so it generates no click, impression, order
or commission.

| route | outbound eBay hrefs | attribution |
|---|---|---|
| `/sealed-deals`, `/sealed-deals?product=` | 178 each | **100% `other`** |
| `/japanese-cards` | 24 | **100% `other`** |
| `/latest-releases` | 12 | **100% `other`** |
| `/guides/pokemon-151-buying-guide` | 3 | **100% `other`** |
| `/`, `/deals`, `/best-finds`, `/pokemon/[slug]` | 88 | attributed |
| **total sampled** | **475** | **395 = 83.2% `other`** |

## Two causes

1. **Real surfaces had no token.** `sealed`, `sealed_hub`, `guide_offers`,
   `japanese_cards`, `latest_releases` were never added to the closed enum,
   so they fell through to the fallback. A test in
   `tests/scanner/ebay-affiliate-attribution.test.mjs` even **pinned**
   `sealed_hub` and `japanese_cards` as `"other"`, locking the gap in.
2. **One token answered two questions.** `home_best` fuses *which page*
   with *which module on it*, so there was no way to distinguish the sealed
   catalogue's browse grid from its selected-product panel without
   inventing a new fused token for every combination.

## The format

```
customid = "<page>-<placement>"          e.g. sealed-selected
subId1   = "<page>-<placement>"          the same value, Impact's parameter
```

Both halves are closed `Set`s of literal strings, joined by `-`, which
neither half contains. Longest producible value: **17 characters**, against
EPN's documented 256-character `customid` limit; a conservative 40-char cap
and a `[a-z0-9_]+-[a-z0-9_]+` shape are both asserted over the entire
cross-product of the vocabularies, and `encodeURIComponent` is a no-op on
every one of them.

**page** — where the outbound click happened:
`home`, `deals`, `deal`, `best_finds`, `search`, `card`, `pokemon`, `set`,
`sealed`, `sealed_item`, `guide`, `japanese`, `latest`, `other`

**placement** — which control on that page:
`best`, `all`, `fresh`, `ending`, `grid`, `catalog`, `feature`, `selected`,
`offer`, `sticky`, `related`, `search`, `reference`, `condition`,
`variant`, `sealed`, `sold`, `other`

## Page is not acquisition source

A reader who lands on a guide and clicks through to `/sealed-deals` clicks
out **on the sealed catalogue**: the page token is `sealed`, never `guide`.
The guide is the *landing* source, and that already lives — correctly, and
only where it is reliably captured — in the analytics landing context
(`traffic_source`, `utm_*`, `landing_page_type`, set once per page-load
chain by `components/analytics/AnalyticsBootstrap.js`, with
`attribution_scope` saying whether it was a real acquisition or carried
across a client-side navigation). It is deliberately **not** copied into a
network parameter: the posture is cookieless with no browser persistence,
so it is not reliably available at the moment an href is server-rendered,
and a network parameter is the wrong place to assert it.

## Before to after

| Surface | before | after |
|---|---|---|
| homepage flagship row | `home_best` | `home-best` |
| homepage auctions ending | `home_auction` | `home-ending` |
| homepage all deals | `home_all` | `home-all` |
| homepage just added | `home_just_added` | `home-fresh` |
| `/best-finds` | `best_finds` | `best_finds-grid` |
| `/deals` | `deals` | `deals-grid` |
| `/search` deal cards | `search` | `search-grid` |
| `/search` catalogue rows | `search` | `search-catalog` |
| `/cards/[slug]` cheapest offer | `card` | `card-offer` |
| `/cards/[slug]` eBay search CTA | `card` | `card-search` |
| `/cards/[slug]` TCGPlayer | *(none)* | `card-reference` (subId1) |
| `/cards` directory tiles | `other` | `card-catalog` |
| `/pokemon/[slug]` tiles | `pokemon` | `pokemon-grid` |
| `/pokemon/[slug]` catalogue | `pokemon` | `pokemon-catalog` |
| `/sets/[slug]` tiles | `set` | `set-grid` / `set-catalog` |
| `/sets/[slug]` sealed section | `set` | `set-sealed` |
| `/deals/[id]` main CTA | `deal_page` | `deal-offer` |
| `/deals/[id]` sticky CTA | `deal_page` | `deal-sticky` |
| `/deals/[id]` condition grid | `deal_page` | `deal-condition` |
| `/deals/[id]` variant grid | `deal_page` | `deal-variant` |
| `/deals/[id]` sold comps | `deal_page` | `deal-sold` |
| `/deals/[id]` related deals | `deal_page` | `deal-related` |
| `/sealed-deals` featured strip | **`other`** | `sealed-feature` |
| `/sealed-deals` browse grid | **`other`** | `sealed-grid` |
| `/sealed-deals?product=` panel | **`other`** | `sealed-selected` |
| `/sealed-deals/[id]` | `deal_page` | `sealed_item-offer` |
| guide live-offers module | **`other`** | `guide-offer` |
| `/japanese-cards` | **`other`** | `japanese-grid` |
| `/latest-releases` | **`other`** | `latest-grid` |
| genuinely unknown | `other` | `other-other` |

The ~15 call sites that still pass a single legacy `surface` string keep
working through `LEGACY_SURFACE_TO_ATTRIBUTION`, which maps each historical
value onto the pair above. A test asserts every historical surface has a
translation, so no call site silently degrades during the migration.

## eBay and Impact are not the same contract

| | eBay Partner Network | TCGPlayer via impact.com |
|---|---|---|
| builder | `lib/ebayLinks.js` `wrapEbayAffiliateUrl` | `lib/tcgplayer.js` `buildTcgplayerLink` |
| parameter | `customid` | `subId1` |
| other params preserved | `campid`, `mkevt`, `mkcid`, `mkrid`, `toolid`, `_nkw`, `_sacat` | the tracking base path and the `u=` destination, byte-identical |

They are separate functions on purpose, so neither can inherit the other's
parameter name — asserted directly (`customid` never appears on an Impact
href, `subId1` never on an eBay one). Only the identifier **value** is
shared, which is what lets one PostHog row be joined to either report.

**The Impact change is verified structurally only.** `subId1` is Impact's
documented partner sub-ID parameter, and the tests pin that the tracking
base, the `u=` destination and its encoding are unchanged. Whether the
value appears in *this account's* Impact reporting can only be confirmed by
a real click, which this work deliberately does not generate.

## Using the new identifiers in existing reports

- **EPN / Impact dashboards.** Group by sub-ID as before. The value now
  splits on `-`: the first half is the page, the second the control. So
  "all sealed-catalogue revenue" is the `sealed-*` prefix, and
  `sealed-selected` is clicks on the selected-product panel specifically.
  **`sealed-selected` identifies the PLACEMENT that was clicked, not where
  the visitor came from.** That panel is reached by any link carrying
  `?product=` — a guide, a shared URL, search, a direct visit. To ask
  whether guide readers are the ones clicking it, cross `affiliate_page` /
  `affiliate_placement` with the landing context (`traffic_source`,
  `utm_*`, `landing_page_type`, `attribution_scope`) on the same
  `affiliate_click` event. The sub-ID alone cannot answer it.
- **`npm run report:growth`** (`scripts/reporting/growthReport.mjs`) is
  unchanged and its existing dimensions (`page_type`, `placement`,
  `origin_section`, `network`) still work. `affiliate_click` now *also*
  carries `epn_customid`, `affiliate_page` and `affiliate_placement`.
- **Joining the two systems.** `epn_customid` is the join key: it is the
  exact string the network receives, because the click components read it
  back off the href they are about to follow rather than being plumbed a
  second copy that could drift. Join on the identifier, never on a user or
  session.
- **Acquisition source** stays where it already is: `traffic_source`,
  `utm_*`, `landing_page_type` and `attribution_scope` on the same event,
  from the landing context. Cross it with `affiliate_page` to ask "which
  landing sources produce clicks on the sealed catalogue" — the two are
  different dimensions and must not be conflated.

## Measurement period

**This deployment starts the improved measurement period.** Historical
`other` rows are unchanged and are not back-filled; an EPN row from before
it means "we could not tell", not "surface: other". Instrumentation is
verified (below); recorded clicks, orders and commission require
subsequent real visitor activity and cannot be asserted from shipping.

## Two event-integrity defects found while tracing, both fixed

1. **A double count on `/search`.** Every result card was wrapped in a
   `<div onClick>` that fired on *any* click inside it — including the
   card's own "View on eBay" affiliate CTA, which emits its own
   `affiliate_click`. One click on that button produced **two Vercel
   events and two PostHog events**, inflating the search surface relative
   to every other. Affiliate anchors now carry `data-affiliate-link`, and
   the wrapper stands down when a click originated inside one.
2. **A silent under-count in the catalogue.** The tile's "Find on eBay"
   was a bare `<a>` with its own `track()` call: it emitted the Vercel
   event but **no** `affiliate_click`, so the catalogue's only route to
   eBay was invisible to the growth report — and its href came from the
   cached data layer with no page context, so it carried the fallback. It
   now uses the shared `EbaySearchLink`, which localises identically. A
   test fails if any sponsored anchor is ever added outside the two
   emitting components.

## Verification

`tests/scanner/affiliate-attribution-2026-09-25.test.mjs` — 28 tests, all
offline. Both click components are compiled and their rendered anchor's
`onClick` invoked directly against stubbed analytics: no navigation, no
request, no event leaves the process. Covers the format and its limits, the
whole vocabulary cross-product, hostile inputs, the legacy migration,
destination/campaign preservation, marketplace routing, idempotent
re-wrapping, the two networks' separation, one-event-per-action, and
`rel="sponsored noopener noreferrer"` + `target="_blank"`.

`scripts/integrity/verifyAffiliateAttribution.mjs` — the production census,
re-runnable, exits non-zero if any href is unattributed, malformed, loses
`campid`, loses its destination, or if one of the four named routes is
still entirely fallback.
