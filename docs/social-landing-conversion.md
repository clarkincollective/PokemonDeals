# Social Landing + Deal Conversion — Phase UX-CVR-1

Improves the WEBSITE experience for visitors arriving from a social post
(the 13E.7A UTM links) so they immediately understand **what the site
does**, **why the deal is credible**, **what the numbers mean**, and
**what to do next** — without a redesign. Scope is `/deals/[id]` (live +
expired), the mobile sticky CTA, and the shared deal-CTA contract.

Nothing about social publishing changed. No eBay Browse call is made at
render time. `_waitForQuota.sh` was not touched.

---

## 1. Social landing routes

Social creatives point at real on-site deep links (see
`lib/social/distribution/attribution.mjs`). The routes that actually
receive social traffic:

| route | role | first-screen job |
|---|---|---|
| `/deals/[id]` | **primary** — one live listing | card · listed price · recent market reference · saving · listing type · source · primary CTA |
| `/deals/[id]` (ended) | the same URL after the listing dies | truthful "ended" + real paths forward |
| `/deals`, `/deals/under-25`, `/deals/graded`, … | category landings | grid of live deals, already sound |
| `/cards/[slug]`, `/pokemon/[slug]`, `/sets/[slug]` | catalogue hubs | already sound (own sticky CTA, own trust copy) |
| `/market-data/*`, `/guides/*` | context | editorial; out of scope here |

`market_mover` social posts point at `/cards` — a browse surface, already
fine.

---

## 2. The conversion funnel

```
SOCIAL VISIT            utm_source=<platform> utm_medium=social utm_campaign=<goal> utm_content=<content_id>
   │                    -> AnalyticsBootstrap seeds these into the in-memory common context
   ▼
DEAL PAGE VIEW          deal_viewed_from_home / qualified_detail_view  (DetailViewAnalytics)
   │
   ▼
PRIMARY CTA CLICK       affiliate_click  { origin_section:"deal_detail_primary" | "sticky_cta", content_id, listing_type, ... }
   │
   ▼
AFFILIATE OUTBOUND      the click itself IS the outbound (target="_blank", rel="sponsored") -> eBay

secondary:
SOCIAL VISIT ─▶ RELATED DEAL (affiliate_click origin_section:"deal_related") ─▶ AFFILIATE OUTBOUND
SOCIAL VISIT ─▶ EXPIRED PAGE ─▶ species/set/card-hub link OR related-deal click
```

### How PostHog measures it (no new analytics system)

- Every event already carries `utm_source` / `utm_campaign` /
  `utm_content` from the common context, so **filter any funnel on
  `utm_content = <content_id>`** to isolate one social creative.
- Step 1→2: `deal_viewed_from_home` / `qualified_detail_view` with a
  social `utm_*` on the same session.
- Step 2→3: `affiliate_click` where `origin_section` ∈
  {`deal_detail_primary`, `sticky_cta`, `deal_related`}.
- Website CTR = attributed `deal_viewed_*` / social-post impressions
  (impressions from `social:metrics`); affiliate-outbound rate =
  `affiliate_click` / attributed visits. Both are computed in
  `lib/social/distribution/metrics.mjs` `computeKpis()` from an owner
  export keyed by `content_id` (see `docs/social-performance.md` §7).
- Success is **a qualified outbound click or a jump to another relevant
  deal** — a fast bounce straight to eBay is a good session, not a bad
  one (§19). Do not optimise raw bounce rate.

---

## 3. Before / after findings

| # | area | before | after |
|---|---|---|---|
| CTA contract | primary CTA | `/deals/[id]` + `/sealed-deals/[id]` said **"View Deal →"** / **"Bid Now →"** — did not name the destination, and "Bid Now" nudges urgency | **"View on eBay →"** / **"Bid on eBay →"** on both detail pages + the sealed card + the sticky default + the card-hub sticky. Every primary CTA now names eBay and none implies a guaranteed purchase. |
| source | marketplace | a bare flag emoji with a `title` tooltip | a visible chip: **"🇺🇸 on eBay · United States"** |
| freshness | recency on the deal page | none | **"Listing checked {N} ago · price and availability can change."** from the real `last_seen_at` (never render time) |
| what-is-this | cold visitor on a deep link | only "Compared against real market pricing" | one line: **"We scan live eBay listings for Pokemon cards priced below recent sold prices."** (small, below the price — never above the deal) |
| jargon | price explainer | "Compared against real market pricing" | "Compared against **a recent market reference**" — matches the wording used everywhere else and the `<AuctionPrice>` "market ref" line |
| social continuity | arriving from a post | nothing | `SocialLandingBadge` — one subtle line, **client-only**, shown only when `utm_medium=social` (or a known `utm_source`), never renders the raw UTM, adds no storage. Organic/direct/search see nothing. |
| expired deal | dead listing | card name + (sometimes) a card-hub link + an eBay search + "Back to all deals" — **no footer, so no affiliate disclosure on a page that has an affiliate link**; no species/set link; no live deals | + `<SiteFooter />` (disclosure + catalogue nav) · + explicit **"All {Species} deals →"** / **"{Set} deals →"** links · + a **related live-deals module** · CTA copy is `Search eBay for this card →`, never a live-deal CTA |
| related deals | live deal page | none — only count/slug links to the hub / species | a **"More live {Pokemon} deals"** module below the primary CTA: real active DB rows only, same exact printing → same Pokemon, best discount first, one listing per card, capped at 4 |
| mobile sticky | tap target | `py-2.5` (~40px), button shares the row 50/50 with the price, flat against the page | `py-3` + `min-h-[44px]`, `basis-3/5` so the button keeps ≥60% width, a soft top shadow to seat the bar, price truncates instead of squeezing the button |
| mobile primary CTA | in-page button | `px-4 py-2`, equal weight to "Check on TCGPlayer" / Share / Save in a wrap row | `w-full sm:w-auto` + `px-5 py-2.5` — unambiguously the primary action on a phone, still inline on desktop |

---

## 4. P0 / P1 / P2 table

| sev | finding | status |
|---|---|---|
| **P1** | primary deal CTA ("View Deal", "Bid Now") did not name eBay and implied urgency; three surfaces disagreed on the label | **FIXED** — one contract: `View on eBay →` / `Bid on eBay →` |
| **P1** | expired deal page rendered an `AffiliateLink` with **no affiliate disclosure** (no footer) | **FIXED** — `<SiteFooter />` added to the expired branch |
| **P1** | cold social visitor on `/deals/[id]` had no source line and no "what is this" — credibility gap | **FIXED** — "on eBay · {country}", "Listing checked {N} ago", one-line site explainer |
| **P1** | expired deal page was close to a dead end (no species/set link, no live alternatives) | **FIXED** — species/set links + a related live-deals module |
| **P1** | no related-live-deals module on the live deal page (secondary funnel path missing) | **FIXED** — `components/RelatedDeals.js` + `fetchRelatedActiveDeals` (DB-only) |
| **P2** | mobile sticky CTA ~40px tall, button can be squeezed below 60% width | **FIXED** — `py-3` + `min-h-[44px]` + `basis-3/5` |
| **P2** | in-page primary CTA equal visual weight to secondary buttons on mobile | **FIXED** — `w-full sm:w-auto`, larger padding |
| **P2** | expired-branch alternative links are three equal-weight red text links with no primary | **OPEN** — small hierarchy nudge; make "All {Species} deals" button-style. Follow-up. |
| **P2** | three stacked `text-xs text-zinc-400` lines under the price read as a small grey wall | **OPEN** — merge freshness into the methodology line. Follow-up. |
| **P2** | full lexical CTA merge — DealCard still says "Check deal on eBay", SpeciesCard "View Deal on eBay" (both name eBay, none implies a buy) | **OPEN** — deliberately deferred; not a contradiction, low value, high test churn |
| **P2** | related-deals module has no same-**set** tier (only same-printing → same-species) | **OPEN** — species covers the common case; a set tier is a clean follow-up on `fetchRelatedActiveDeals` |
| **HEALTHY** | homepage "what is this" (H1 + "Every listing checked against real sold prices. The junk filtered out. Free.") | no change needed |
| **HEALTHY** | image trust — seller-front-first, subtle "Reference image" label, never a card back | no change (`lib/listingImage.js` untouched) |
| **HEALTHY** | auction price integrity — `<AuctionPrice>` current bid / + shipping / est. total, never labels the landed total as the bid | preserved; the sticky still labels the auction price "current bid" |
| **HEALTHY** | no fabricated urgency anywhere; only real timestamps ("checked {N} ago", "ends {N}") | preserved; guarded by `tests/seo/conversion-ux.test.mjs` |

---

## 5. Analytics measurement (§17)

No new taxonomy. `affiliate_click` already carries `origin_section`,
`content_id`, `deal_id`, `listing_type`, `price_band_usd`,
`discount_band`, `country`, plus the common `utm_*`. UX-CVR-1 only adds
**explicit low-cardinality `origin_section` values** so the funnel is
sliceable:

| surface | `origin_section` |
|---|---|
| deal-detail in-page primary CTA | `deal_detail_primary` |
| deal-detail sticky CTA | `sticky_cta` (unchanged) |
| related-deals module CTA | `deal_related` |
| expired-page eBay search link | `expired_deal` |

`deal_related` also maps to the EPN `customid` surface `deal_page`
(`lib/affiliateSurfaces.js`) so affiliate revenue from the module is
attributable without any per-card cardinality.

---

## 6. Mobile decisions (§13)

- The **sticky CTA is the mobile primary affordance**; the in-page CTA is
  full-width on mobile and the sticky appears only after scrolling ~480px
  past it, so there is never a duplicate primary CTA competing on screen
  at once (`tests/scanner/social-landing-conversion-uxcvr1.test.mjs`).
- Sticky tap target ≥ 44px; the reserved `h-20 lg:hidden` spacer below
  the footer keeps the fixed bar from covering the disclosure.
- The related-deals grid is `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` —
  no horizontal overflow, no 1,000px dead space.
- `SocialLandingBadge` is an inline pill that wraps; adds one line.
- Desktop is unchanged (`sm:w-auto` on the CTA, `lg:hidden` on the
  sticky).

---

## 7. Expired-deal behaviour (§11)

`app/deals/[id]/page.js`, the `!shouldIndexDeal || !isDisplayableDeal`
branch:

1. Headline: **"This deal has ended"** (or "Deal not found" when no row
   exists). Never redirects, never shows the old listing as buyable
   (guarded by `tests/scanner/deal-availability-freshness.test.mjs` and
   `…/social-landing-conversion-uxcvr1.test.mjs`).
2. Paths forward, in order: card hub (when 2+ live listings) → **All
   {Species} deals** → **{Set} deals** → **Search eBay for this card**
   → **Back to all deals**.
3. A **related live-deals module** (`fetchRelatedActiveDeals`) when any
   exist — real active rows only, no eBay call.
4. `<SiteFooter />` — the affiliate disclosure and the catalogue nav.

---

## 8. Files changed

- `app/deals/[id]/page.js` — CTA contract; source line; freshness +
  explainer microcopy; `<SocialLandingBadge/>`; related-deals on the live
  page; expired branch reworked (species/set links, related module,
  footer); primary-CTA emphasis; explicit `origin_section`.
- `app/sealed-deals/[id]/page.js`, `components/SealedDealCard.js`,
  `components/StickyDealCta.js`, `app/cards/[slug]/page.js` — CTA contract.
- `components/StickyDealCta.js` — tap target + button width + top shadow.
- `components/RelatedDeals.js` (new) — the module.
- `components/SocialLandingBadge.js` (new) — the §4 continuity line.
- `lib/deals.js` — `fetchRelatedActiveDeals` (DB-only, `unstable_cache`).
- `lib/affiliateSurfaces.js` — `deal_related` → `deal_page` EPN surface.
- `tests/scanner/social-landing-conversion-uxcvr1.test.mjs` (new, 13).

---

# UX-CVR-2 — Homepage + Deal Browse Conversion Polish

Follows UX-CVR-1. High-confidence P0/P1 only, no redesign, P0.4.1 diversity
work untouched, no scanner/qualification change, no eBay call at render.

## 9. Homepage funnel

```
HOMEPAGE  →  a curated lane card (Best Deals / Auctions / Just Added / Under $25 / All Deals)
   │           or the "Browse today's deals ↓" primary CTA
   ▼
DEAL DETAIL  →  primary "View on eBay →" / "Bid on eBay →"  (UX-CVR-1 sticky + inline)
   ▼
EBAY OUTBOUND  (affiliate_click, origin_section = the lane's pageName)
```

## 10. Browse funnel

```
HOMEPAGE "All Deals" section  ─ FilterBar (Sort / Country / Card & listing / Price)
   │   filtered → 0 results?  → a real EMPTY-STATE block (Clear filters + Browse all + Under $25 + Newest)
   ▼
DEAL CARD  →  "View on eBay →" / "Bid on eBay →"
   ▼
EBAY OUTBOUND

/deals  →  category hub grid  →  /deals/<category>  (DealGrid: AppliedFilters chips + FilteredEmptyState)
```

## 11. Changes made

| # | area | before | after |
|---|---|---|---|
| CTA contract (§7) | deal-card CTA | DealCard "Check deal on eBay →" · SpeciesCard / CatalogueBrowser "View Deal on eBay" · detail "View on eBay" (UX-CVR-1) — three lexical variants | **one contract everywhere**: BIN "View on eBay →", auction "Bid on eBay →". The internal Vercel-Analytics `eventName` strings keep their old values for historical continuity (they carry no arrow glyph and are not visible copy). |
| empty state (§13) | filtered/category grid with 0 results | a bare grey sentence, no recovery links (and on a page-1 filtered homepage view the "Clear filters" link didn't even render) | a bordered card: honest heading ("these filters run against real, currently-active listings — nothing was broadened"), the relaxation pills (`FilteredEmptyState`), **and** always-present escapes — **Browse all live deals →**, **Under $25 →**, **Newest →**. The homepage All Deals empty branch also gets a **Clear filters** button. New `EmptyGridState` + `EmptyStateEscapes` in `components/DealFilterChips.js`. |
| active-filter visibility (§8) | `AppliedFilters` / `FilterNotes` chips only on `/pokemon/[slug]` (13B.3-scoped) | shown on **every** grid via `DealGrid` — a category page now shows which filters are applied and each chip's ✕ removes exactly that filter |
| filter/sort labels (§9, §12) | already human ("Biggest discount", "Price: low to high", "Newest", "Ending soon", "Under $25"…) | **unchanged** — HEALTHY |
| homepage hero (§1–§3) | H1 "Pokemon Card Deals — Underpriced Cards on eBay" + "Every listing checked against real sold prices. The junk filtered out. Free." + solid "Browse today's deals ↓" primary + plain-text example searches | **unchanged** — the 5-second what/how/value is clear; the filled dark button is the single dominant CTA and the example searches are underline links, not competing buttons — HEALTHY |
| lane order (§5) | Best Deals → Auctions → All Deals → Just Added → Under $25 → Explore | **unchanged** — the 13C.3 hierarchy is deliberate and tested; not weaker |
| trust (§4, §17) | live-count + "checked X ago" + methodology link in the hero; slim "checked against real eBay sold listings · updated continuously · we may earn a commission…" strip near the deals; footer disclosure | **unchanged** — factual, no "best prices" / "guaranteed savings" — HEALTHY. Every deal CTA now names eBay (§17). |
| `/deals` first screen (§8) | breadcrumb + H1 + intro + category grid + "Newest finds" strip | **unchanged** — it is a clear category hub, not a filter page — HEALTHY |

## 12. P0 / P1 / P2 findings

| sev | finding | status |
|---|---|---|
| **P1** | a filtered/category grid with 0 results was a near-dead-end (bare sentence, no forward path) | **FIXED** — recovery block on every grid + the homepage |
| **P1** | three lexical CTA variants across DealCard / SpeciesCard / CatalogueBrowser / detail | **FIXED** — one "View on eBay" / "Bid on eBay" contract |
| **P2** | active-filter chips were Pokemon-page-only | **FIXED** — now on every grid |
| **P2** | homepage hero has two loud affordances (search box + "Browse today's deals" button) | **OPEN** — deliberate 13C.1 "two homepage jobs" design; not a regression, left as-is |
| **P2** | DealCard stacks a lot (image, badge, name, set·condition, price, save line, listings·found-ago, CTA) | **OPEN** — all tiered, nothing overcrowded; no change |
| **P3** | homepage empty-state row can wrap to 4 items on a narrow phone | **OPEN** — rare error state, acceptable |
| **HEALTHY** | homepage "what is this" in ~5s; lane labels/order; sort labels; `/deals` hub; trust strip; no fabricated urgency | no change |
| **HEALTHY** | P0.4.1 diversity / 3-h rotation / under-$25 lane / species soft cap | untouched (`lib/homepageVariety.js` unchanged) |

## 13. Performance impact

None. No new DB query, no eBay call, no client bundle growth — the
empty-state components are server components rendered only when a grid has
0 rows. `AppliedFilters` / `FilterNotes` were already imported by
`DealGrid`; the change is dropping a `showGrading &&` guard. Homepage
TTFB / HTML size / cached-read model unchanged.

## 14. Analytics coverage

No new taxonomy. Homepage→deal vs browse→deal is already distinguishable
by `pageName` (`home_best` / `home_ending` / `home_fresh` / `home_under25`
/ `home_all_deals` vs `deals_index` / `category_detail`). Filter use is
`filter_opened` / `filter_applied` / `filter_cleared` / `sort_changed`.
The new empty-state recovery links carry existing markers —
`filter_cleared` (relaxation / Clear filters) and
`browse_all_deals_clicked` (Browse all live deals). Primary affiliate
outbound stays `affiliate_click` with `origin_section`.

## 15. Impeccable pass (§19)

Degraded single-context (no sub-agent spawn). Detector clean on every
changed file except one pre-existing false positive on `DealCard.js:296`
(`text-zinc-900 on bg-red-600` — the code also has `dark:hover:text-white`,
so the hover state is correct). No P0/P1 design issues: the changes are
net-positive for CTA clarity and turn a dead-end into a forward path,
using the site's existing `rounded-xl border shadow-card` idiom. No
redesign; nothing to fix.

## 16. Files changed (UX-CVR-2)

- `components/DealCard.js`, `components/SpeciesCard.js`,
  `components/CatalogueBrowser.js` — CTA label → "View on eBay" (BIN).
- `components/DealFilterChips.js` — new `EmptyStateEscapes` /
  `EmptyGridState`; `FilteredEmptyState` gains the escape links.
- `components/DealGrid.js` — `FilteredEmptyState` / `EmptyGridState` for
  both empty branches; `AppliedFilters` / `FilterNotes` on every grid.
- `app/page.js` — real empty-state block for the All Deals grid.
- `tests/seo/conversion-ux.test.mjs`,
  `tests/scanner/analytics-homepage-13c5.test.mjs` — assertion widening.
- `tests/scanner/homepage-browse-conversion-uxcvr2.test.mjs` (new, 12).
