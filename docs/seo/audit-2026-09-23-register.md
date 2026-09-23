# External SEO / affiliate audit, 2026-09-23 — working register

Source: `PokemonDealFinder-SEO-Affiliate-Audit-2026-09-23.md` plus its
evidence archive (both supplied by the owner; neither is in this repo).
This file tracks what has been closed, what is open, and any defect found
while working a finding that is NOT part of that finding.

## Findings

| # | Summary | State |
|---|---|---|
| 1 | Graded singles presented as sealed ETBs (deals 2435, 961) | **closed** — commits `ad7d2d8`, `1ff328a`, `93e6461`, `108ae12`, 2026-09-24 |
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

## Finding 1 — what was measured, and what changed

Both examples reconfirmed live on 2026-09-24 against the listing
photographs: `/sealed-deals/2435` was a PSA 9 slab of *N's Zekrom #031*
(2026 Pokemon MEP EN, cert 157355382) sold at $43 and rendered as a
$147.89 Ascended Heroes ETB; `/sealed-deals/961` was a PSA 9 *Shining
Ho-Oh SM70* (cert 47718760) at £347.10 rendered as a Shining Legends ETB.

Root cause was the **evidence**, not the architecture:
`sealedListingDecision` already runs at ingestion and at display, but its
single-card markers needed a digit immediately after the grader
(`PSA 10`), and real slab titles write the grade in words (`CGC Mint 9`)
or omit it.

| | count |
|---|---|
| stored `sealed_deals` rows | 727 |
| displayable before | 188 |
| displayable after the matcher fix | 134 (**54 removed**) |
| confirmed cohort contained | **67** — 46 `single_card`, 15 `accessory`, 6 `empty_box` |
| rejected for *other* reasons, reported not written | 333 (262 active) |
| accepted as valid, untouched | 316 |
| genuine sealed rows still making a supported savings claim | 40 |

Containment sets one column, `disqualified_reason =
"product:not_a_sealed_product"`, guarded on six fields, snapshot first,
canary first, rollback available —
`scripts/remediation/sealedIdentityQuarantine.mjs`. Snapshot and prior
files live in `.local/remediation/` (gitignored).

Two containment **leaks** were found during production verification and
fixed in the same pass, both the same field-whitelist class: the sealed
sitemap (`93e6461`) and the sealed catalogue offers (`108ae12`) embedded
`sealed_watchlist` without `name`, and
`dealQuality.sealedRowMatchesItsProduct` opens with
`if (!product?.name) return true` — so a missing column produced an
**accept**, not a reject.

## Separate defects found while working finding 1 (recorded, NOT fixed here)

1. **Opened or refilled boxes are priced as sealed.** Still displayable:
   *"Shining Fates Elite Trainer Box. Booster Packs Open but Complete."*,
   *"Shining Fates Elite Trainer Box Open Please Read Description"*, and
   three rows reading *"Champion's Path Elite Trainer Box. Fulled
   W/Recent Pokemon Cards"*. These are a **condition** claim, not a
   product-identity one, so they were deliberately left out of a bounded
   identity fix. They should not be priced against a sealed reference.

2. **A multi-item listing is bound to one of its items.** Rows 170/171,
   *"Pokemon TCG Prismatic Evolutions Elite Trainer Box ETB Hidden Fates
   Gyarados Tin"*, are matched to the **Hidden Fates ETB**. `KIND_RULES`
   returns the first match and `etb` precedes `tin`, so the title's
   second product wins the attribution. Reordering the kind rules is a
   riskier change than this task allowed.

3. **262 active rows sit on the wrong product for other reasons.** From
   the same dry run: 116 `edition_mismatch:30th_vs_25th`, 84
   `booster_bundle_vs_booster_box`, 23 `quantity_lot`, 11
   `edition_unstated:25th`, and a tail. All are correctly hidden today,
   but they are stored against a product they are not.

4. **Three rows are the same eBay listing.** 956, 959 and 961 all carry
   *"Pokemon Shining Legends Elite Trainer Box Promos Shining Ho Oh &
   Lugia PSA"*. That is audit finding 6 (duplicate marketplace rows),
   visible here because all three landed in the cohort.

5. **Two release invariants were already failing before this work and
   still are**, neither related to sealed identity: INV-7 (11 card rows
   whose stored reference is implausible against the catalogue — the fix
   is `npm run deals:fix-references -- --apply`) and INV-10 (eBay Browse
   went over quota on 2026-09-21, 5035/5000). Budgets and schedules were
   explicitly out of scope here.

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
