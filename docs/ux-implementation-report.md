# UX / conversion implementation report

Date: 2026-08-29
Scope: "Workstream B" — close out the UX/conversion pass on top of the
completed SEO work, without regressing any of it.

## Starting position

- The original UX/psychology audit document was **not recoverable**. It
  is not in the repo and no copy was available.
- Its **P0** items had already been implemented in earlier commits:
  - `31ff5a3` — "UX/conversion audit P0: homepage rebuild, DealCard
    redesign, sort, breadcrumbs, sticky CTA"
  - `9f32d09` — "Desktop UI/UX redesign"
  - `90013da` — "Header: regroup nav for a deal-first hierarchy"
- No P1/P2 backlog exists and none was reconstructed — the brief
  explicitly ruled out re-auditing from scratch.

## Live re-check against the four focus areas

This stands as the record in place of the missing audit. Checked against
production on 2026-08-29, after the SEO work (which touched card pages,
metadata, internal linking).

| Lens | State | Verdict |
| --- | --- | --- |
| **Product-card hierarchy** (`components/DealCard.js`) | Price anchor (largest element) → `typical` strike-through + "Save $X · N% below market" → seller-count link + "found Xh ago" → single full-width dark CTA ("Check deal on eBay →" / "Bid on eBay →"). Tiered discount badge on the image. 2–3 s comprehension met. | Already good. |
| **Homepage hierarchy** (`app/page.js`) | Hero (value prop "Every listing checked against real sold prices. The junk filtered out. Free." + search + popular chips + quick-filter chips + "N live deals · checked X min ago · how we price this →") → Best deals right now → Auctions ending soon → Just added → Most sellers competing → Browse the catalogue → All deals → How it works → FAQ → Buying guides. Every section earns its place; no filler. | Already good. |
| **Trust signals** | Inline affiliate disclosure ("As an eBay and TCGPlayer affiliate, we earn a commission on qualifying purchases … Card-to-listing matching is automated and not perfect — always double-check…"), "compared to the card's real market price for its condition, backed by recent eBay sold listings — not a guess", recency stamp, `/methodology` link. No fake urgency/scarcity/social proof. | Already good. |
| **Choice architecture / friction** | Quick-filter + "Popular now" chips in the hero; sort + country + card-type + listing-type + price-tier filter bar on the grids. One primary action per card. | Already good. |

The card page also already reconciles the SEO framing (price/value first)
with the conversion framing (deals prominent): the `CardPriceSummary`
"Price & value" block sits directly under the H1, with the deal grid
immediately below it.

## Three targeted fixes implemented

### 1. Card-page header CTA

**Files:** `components/CardPriceSummary.js`, `app/cards/[slug]/page.js`

The "Price & value" summary answered a price-intent search well but gave
no way to act without scrolling past it to the deal grid.

- The live-listings line in the summary now carries a primary button:
  **"View all N listings from $X →"** (or "View the listing from $X →"
  when N = 1).
- It is an **in-page anchor** to `#listings` (the featured deal grid),
  which got `id="listings" scroll-mt-24` so the sticky header doesn't
  cover the target.
- In-page anchor, not a direct affiliate link, because the copy promises
  a list to compare — not one pre-picked listing. Every onward click
  from the grid is still affiliate-tracked as before.
- Renders only when there is ≥ 1 active listing.
- Button styling matches the existing `DealCard` CTA
  (`bg-zinc-900 … hover:bg-red-600`).

### 2. Currency hydration flash

**File:** `components/CurrencyProvider.js`

Before: for ~0.5 s after load, a returning viewer saw a native listing
price (e.g. `£39.99`) next to USD reference figures (`typical $154.94`,
`Save $100.63`) until the `/api/rates` round-trip resolved and `<Price>`
swapped them to one currency.

Fix — resolve currency *before first meaningful paint* without a network
wait, and without reading a request-time API on the page (which would
undo the SSG/edge-cache win):

- The last successful `/api/rates` response is cached in `localStorage`
  (`pdf_rates_v1`, 24 h max age, shape-validated on read).
- `CurrencyProvider` is now a module-level store read via
  `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`:
  - `getServerSnapshot()` → the null baseline. SSR and the hydration
    render are unchanged — a crawler still indexes the real per-listing
    currency.
  - `getSnapshot()` → the store, **primed synchronously from the
    `localStorage` cache** on first client read. React applies this in
    the same commit as hydration, before paint — no visible flash, no
    hydration mismatch (this is the documented purpose of
    `getServerSnapshot`).
  - `subscribe()` still kicks off a `/api/rates` fetch on mount to
    refresh stale FX rates and correct the geo currency if the cached
    one is wrong (e.g. the viewer travelled / changed VPN).
- A **first-ever visitor** (no cache) is unchanged: native currency,
  then convert once `/api/rates` lands.
- `useCurrency()` return shape (`{ viewer, marketplace, rates }`) is
  unchanged, so `Price.js`, `RegionRedirect.js`, `SearchClient.js`,
  `CardMemoryStrip.js` need no changes.

**Rejected alternative:** resolving currency server-side from a cookie or
the geo header. That is a request-time API — it forces `/cards/[slug]`,
`/deals/[id]`, `/sets/[slug]`, `/pokemon/[slug]` back to
`Cache-Control: no-store` and undoes the ~6,100-page edge-cache result
this project just achieved.

### 3. "Low confidence" graded label

**File:** `components/CardPriceSummary.js`

`analysis.graded[].isLowConfidence` is PPT's price-outlier / wide-spread
flag (`smartPriceOutlierByGrade[key]` OR `smartMarketPrice.confidence ===
"low"`) — it is **not** about how many sales there were. But it rendered
as "· low confidence" appended to "20 sales" on the same line, which read
as a contradiction ("20 sales isn't low data").

Now it renders on its own amber line under the tier:
**"Price outlier — treat with caution"**. The neutral "N sales" meta
stays where it was.

`VariantPriceGrid` (the "Every variant, side by side" deep-dive grid
lower on the page) keeps its existing "low confidence" wording — there it
sits directly under the price with a sparkline and sale count for
context, so it isn't ambiguous, and changing it was out of scope for the
three named items.

## Bounded final pass (four lenses) — one finding, fixed

**Contaminated graded tiers in the "Price & value" summary.**
`/cards/charizard-base-set` listed a **"TAG 8.5" tier at $25.50** in
"Graded — from real recent sold sales", against a raw Near Mint market
value of **$855.52** — i.e. an "8.5-grade slab" priced at 3 % of the
*ungraded* card. This is a contaminated sold sample (mislabelled lots,
altered/proxy cards carrying a real grade string), and it made the
graded ladder look broken.

The raw condition ladder already guards against this — `conditionLadder()`
stops at the first row that rises above Near Mint or above the previous
row. The graded list had no equivalent guard.

**Fix:** drop any graded tier whose price is **below the raw Near Mint
market value**. Grading costs money and a slab commands a premium, so a
graded tier "selling" under the raw price is a data error, not a market
signal. Kept as-is when there is no raw reference to compare against.
This is the same trade-off the raw ladder already makes (suppress the
figure we can't stand behind rather than show it).

Verified against live data locally: charizard-base-set graded tiers went
from `PSA 10 / CGC 10 / PSA 8.5 / PSA 9 / TAG 8.5` →
`PSA 10 / CGC 10 / PSA 8.5 / PSA 9 / PSA 8`.

The `VariantPriceGrid` grid further down still lists every tier including
low grades — deliberate: it is the exhaustive deep-dive view and each
tile's sparkline + sale count exposes an odd data point better than
hiding it would.

**Nothing else stood out.** The other summariser-flagged items are not
defects:

- "Currency inconsistency" across cards on `/sets/[slug]` — that is the
  no-JS view showing each listing in its own real currency, the
  documented crawler-facing baseline. Fix 2 above addresses it for real
  viewers.
- "Just found" badges, "N live deals", auction "ends in 1m" — real
  recency / inventory / auction data, not fabricated urgency or scarcity.

## Verification

- `npm run test:seo` — **40/40**
- `npm run test:scanner` — **5/5**
- `npm run build` — clean, `/cards/[slug]` still `●` (SSG)
- Card page unchanged where it matters: `<title>`, self-referencing
  canonical (`/cards/<slug>`, no query), `Product` + `BreadcrumbList`
  (3 × `ListItem`) JSON-LD, affiliate `rel` / EPN params.
- Spot-checked locally on `charizard-base-set`, `pikachu-base-set`,
  `blastoise-base-set`: header CTA renders with the correct listing
  count + floor price, `#listings` anchor resolves, graded ladder no
  longer shows the contaminated tier, "Price outlier — treat with
  caution" renders on its own line.

## What was NOT done, and why

- **No P1/P2 backlog reconstruction** — the audit is gone and the brief
  ruled out re-auditing from scratch.
- **No change to `VariantPriceGrid`** beyond what's noted — its "low
  confidence" wording and its full tier list are appropriate for a
  deep-dive section and were outside the three named items.
- **No server-side currency resolution** — would regress the SSG/edge
  caching (see fix 2).
- **No new trust/social-proof UI** — the brief bars fake urgency /
  scarcity / social proof / reviews, and there is no real data for
  genuine versions (no verified purchase counts, no review corpus).
