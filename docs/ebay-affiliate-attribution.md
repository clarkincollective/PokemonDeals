# eBay affiliate sub-ID attribution (EPN customid / affiliateReferenceId)

Implements the one zero-new-access opportunity found by the eBay Developer
capability/quota audit (2026-09-05): the app already sends
`affiliateCampaignId` on every outbound eBay link, but `customid`
(EPN's sub-ID / eBay's `affiliateReferenceId`) was always blank, so EPN
reporting had no way to tell which part of the site generated a click.

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

No individual identifier crosses from one system to the other. Later
comparison of aggregates (e.g. "`home_best` clicks in PostHog" vs.
"`home_best` EPN clicks/revenue") is possible without ever joining on a
user/session.

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
