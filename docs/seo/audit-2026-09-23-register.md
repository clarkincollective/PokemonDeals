# External SEO / affiliate audit, 2026-09-23 — working register

Source: `PokemonDealFinder-SEO-Affiliate-Audit-2026-09-23.md` plus its
evidence archive (both supplied by the owner; neither is in this repo).
This file tracks what has been closed, what is open, and any defect found
while working a finding that is NOT part of that finding.

## Findings

| # | Summary | State |
|---|---|---|
| 1 | Graded singles presented as sealed ETBs (deals 2435, 961; 489 to verify) | **open — P0, not started** |
| 2 | Card-page summaries claim savings their own listing tiles refuse | **closed** — commit `367d79a`, 2026-09-24 |
| 3 | Two 30th Celebration guide links resolve to 404 | **closed** — commit `eeabe80`, 2026-09-23 |
| 4 | Sealed links lose the product selection | open — not started |
| 5 | `customid=other` on some affiliate links | open — not started |
| 6 | Duplicate marketplace rows | open — not started |
| 7 | Hero chips drop qualifiers; desktop overflow 1384 vs 1363px | open — not started |
| 8 | Variant searches drop set / number | open — not started |
| 9 | Sales ordering | open — not started |

## Finding 2 — what was measured, and what changed

Measured against live rows on 2026-09-24, over the 225 English card hubs
with two or more displayable offers:

| | count |
|---|---|
| hubs whose summary asserted a saving | 221 |
| …the cheapest listing's own trust checks REFUSE that saving | **14** |
| …graded listing compared to the panel's raw reference | 3 |
| …cheapest offer is an auction, its bid called a listing price | 50 |
| …" before shipping" qualifier dropped by the summary | 155 |
| …percentage differs from the tile's | 63 |

Fixed by `lib/cardSummaryOffer`, which asks `listingPresentation` and
`offerShipping` rather than re-deriving a rule. See the commit message and
`tests/scanner/card-summary-saving-2026-09-24.test.mjs`.

## Separate defects found while working finding 2 (recorded, NOT fixed here)

1. **`CardPriceSummary`'s live-listing block is unreachable dead code that
   still carries the un-based claim.** `components/CardPriceSummary.js`
   renders `"{n} active listings right now, from <price> (asking prices,
   not sold)"` behind `!detailsOnly && listingsLowUsd != null`. The only
   caller (`components/CardMarketPanel.js`) always passes `detailsOnly`,
   and nothing anywhere passes `listingsLowUsd` — so the block never
   renders today. If it is ever wired up it will repeat exactly the defect
   finding 2 fixed: a "from" figure with no shipping basis, and "asking
   prices" applied to a figure that may be an auction's current bid. Fix
   by feeding it the `lib/cardSummaryOffer` descriptor, or delete it.

2. **The card page's stored reference and the catalogue reference disagree
   for the same product id.** Pikachu ex 238/191 (product 590027) on
   2026-09-24: the cheapest listing stored `market_price = 286.65`
   (observed 2026-09-23T12:01Z) while `card_catalog.market_price` for the
   same id is `286.42` (synced 2026-09-23T02:00Z). Small here, and the two
   figures are now labelled distinctly ("its market reference" vs the
   panel's "current market value"), so nothing on the page contradicts
   itself. But the two are meant to be the same provider figure for the
   same product, and no check compares them. `referenceIsPlausible` only
   catches a 4× divergence. Worth a periodic sweep of the ratio
   distribution; out of scope for a summary fix.

3. **`seo-17b-foundation` test 25 banned a substring, not a behaviour.**
   It asserted that five files contain no occurrence of `Product`, `Offer`
   or `FAQPage`, so an ordinary prop name (`summaryOffer`) read as a schema
   violation while a real one written another way would pass. Corrected in
   the same commit to check how the schema words are used; recorded here
   because it is the same defect class this session keeps finding — a
   hand-maintained claim that nothing checks against reality.
