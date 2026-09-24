# External SEO / affiliate audit, 2026-09-23 — working register

Source: `PokemonDealFinder-SEO-Affiliate-Audit-2026-09-23.md` plus its
evidence archive (both supplied by the owner; neither is in this repo).
This file tracks what has been closed, what is open, and any defect found
while working a finding that is NOT part of that finding.

## Findings

| # | Summary | State |
|---|---|---|
| 1 | Graded singles presented as sealed ETBs (deals 2435, 961) | **closed** — commits `ad7d2d8`, `1ff328a`, `93e6461`, `108ae12`, 2026-09-24; population reconciled and figures corrected 2026-09-24, see below |
| 1a | Sealed identity validator accepts a product with no `name` (fail-open) | **closed** — commit `40e0847`, 2026-09-24 |
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

### Population reconciliation (corrected 2026-09-24)

The first version of this section listed 727 / 67 / 333 / 316, which totals
**716**. Two categories were omitted. The complete, mutually exclusive
breakdown, read back from the retained snapshot
(`.local/remediation/sealed-identity-snapshot-2026-09-24.json`,
`builtAt 2026-09-23T22:34:49Z`):

| # | Category | Definition (as `classify()` assigns it, first match wins) | Rows | Written? |
|---|---|---|---|---|
| 1 | `quarantine` | rejected by the shipped identity rule for one of **this finding's** reasons, `is_active = true`, no prior `disqualified_reason` | **67** | yes — one column |
| 2 | `unresolved` | no product row to compare against, **or** rejected for a reason this pass does not own | **333** | no |
| 3 | `valid` | accepted by the shipped identity rule | **316** | no |
| 4 | `alreadyDisqualified` | rejected for one of this finding's reasons but already carried a `disqualified_reason` | **0** | no |
| 5 | `inactive` | rejected for one of this finding's reasons but `is_active = false` — already retired, and the write guard requires `is_active = true` | **11** | no — **intentionally excluded** |
| | **Total** | | **727** | |

**The 11** are deal ids 38, 39, 41, 44, 50, 54, 55, 190, 220, 944, 958.
All eleven are `kind_mismatch:single_card`, all `is_active = false`, none
carried a prior `disqualified_reason`. They are excluded deliberately, not
dropped: they are already retired, so they render nowhere, and writing a
classification onto a retired row would have required relaxing the
`is_active = true` guard that makes the repair safe. If any of them is
ever re-activated by a scan, the shipped matcher refuses it at ingestion
and the display gate refuses it on the stored row, so the exclusion is not
a gap in protection — only in the persisted audit trail.

Set arithmetic checked directly: the three id-bearing categories are
pairwise disjoint (`q∩u`, `q∩i`, `u∩i` all 0) and their union is exactly
the 411 `trackedIds` in the snapshot.

**Retention limitation.** The snapshot retained full entries and stable
ids for categories 1, 2, 4 and 5 (411 ids) but only a **count** for
category 3 (`valid`). The 316 valid ids are therefore not recoverable from
the snapshot alone. A second retained read of the same table taken four
minutes earlier (08:30 local vs 08:34) holds all 727 rows; its id set is
**identical** to the snapshot's population (411 tracked ids all present, 316
untracked), which is what makes category 3 accountable by id. That earlier
read is a separate artefact, not the snapshot, and it is scratch data, not
a durable record.

### Cohort composition — corrected

| Reason | Rows |
|---|---|
| `kind_mismatch:single_card` | **49** |
| `kind_mismatch:accessory` | **13** |
| `kind_mismatch:empty_box` | **5** |
| Total | 67 |

The earlier figures (46 / 15 / 6) were counted by eye from the dry-run
printout and are **wrong**; the commit message on `1ff328a` carries them
and cannot now be amended. The split above is read from the snapshot and
independently re-derived from the retained titles with the shipped
`productKindOfTitle` — both agree, with zero disagreements across all 67.

### Evidence strength — confirmed vs. needs more evidence

| | Rows | Basis |
|---|---|---|
| Independently confirmed | **2** | 2435 and 961, checked against the listing photograph (PSA 9 slabs, certs 157355382 and 47718760) |
| Confirmed by title evidence only | **65** | rejected by the shipped rule; no image or listing-page review |
| **Unresolved — not assessed** | **333** (262 active) | rejected by the shipped rule for reasons *outside* this finding. Their correctness was **not** established either way |
| Accepted by the rule — not verified | **316** | the rule accepts them; that is not an independent confirmation that each is the product it names |

Of the 316 accepted, 39 already carried an unrelated `disqualified_reason`
and 168 were inactive — so "valid" means *"the identity rule accepts it"*,
not *"displayable"* and not *"verified correct"*.

### Displayable-count baselines — same predicate, different reads

The 202 and 188 figures are the **same predicate** (the full
`isDisplayableSealedDeal` gate with the pre-fix matcher) applied to **two
different reads** of a live table about an hour apart. Neither a cutoff nor
a population definition changed:

| Read | Pre-fix matcher | Post-fix matcher | Effect |
|---|---|---|---|
| 08:30 local, retained as scratch JSON | 202 | 148 | −54 |
| later fresh read, post-containment | 188 | 134 | −54 |

The 202 → 188 difference is ordinary drift in a live listings table
between the two reads. The matcher's effect is **−54 in both**, which is
the figure the report should be read on; the "188 → 134" row in the
summary table below is the later pair, quoted together so the two halves
share one read.

| | count |
|---|---|
| stored `sealed_deals` rows | 727 |
| displayable before / after, later read | 188 → 134 (**−54**) |
| displayable before / after, 08:30 read | 202 → 148 (**−54**) |
| cohort contained | **67** (49 single_card, 13 accessory, 5 empty_box) |
| unresolved, reported not written | 333 (262 active) |
| accepted by the identity rule, untouched | 316 |
| rejected for this finding's reasons but already retired | 11 |
| already carried a `disqualified_reason` | 0 |
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

### The validator still fails open — what was and was not fixed

`sealedRowMatchesItsProduct` is **unchanged** and still reads:

```js
const product = row?.sealed_watchlist;
if (!product?.name) return true; // nothing to check against
```

A row whose embedded product carries no `name` is still **accepted**. What
the two commits fixed is every *known caller's projection*, so that no
query in the repo hands the validator an incomplete product today. That is
caller-side hygiene, not validator-side rejection: any future caller that
omits `name` — a new file, a differently written select, a row assembled in
code, an RPC or view — reintroduces the leak silently, because the failure
mode is an accept rather than an error.

Exactly what the two tests guarantee:

- **SI-17** asserts `isDisplayableSealedDeal(rowWithoutName) === true`. It
  **documents** the fail-open behaviour; it does not prevent it. It is a
  characterisation test, and an uncomfortable consequence is that SI-17
  currently *pins the fail-open behaviour in place*: making the validator
  reject a nameless product would make SI-17 fail, and the test would have
  to be inverted at the same time.
- **SI-18** is a **static text scan**. It reads four files —
  `lib/deals.js`, `lib/sitemap.js`, `lib/sealedVerifyLane.mjs`,
  `app/sealed-deals/[id]/page.js` — matches the literal pattern
  `sealed_watchlist:sealed_watchlist_id[!inner](…)`, and requires `name`
  and `set` inside each. That is **7 embeds** today. It guarantees nothing
  about: files outside that list (`scripts/fixSubstringMatches.js`,
  `scripts/reactivateFalsePositives.js` and
  `scripts/remediation/sealedIdentityQuarantine.mjs` each contain one such
  embed and are not scanned — all three do include `name`, so there is no
  live gap, only no pin); selects written any other way; rows built in
  code; or callers that pass a partial object. An embed the regex cannot
  see passes silently.

**Remaining fail-open behaviour, stated plainly:** the sealed identity
validator treats a missing product name as "nothing to check" and accepts.
Closing it properly means making the validator return `false` (or throw)
on incomplete input and inverting SI-17 — a behaviour change to a shared
gate, deliberately out of scope for a bounded reporting reconciliation, and
recorded here as open.

### Item 1a — CLOSED, commit `40e0847` (2026-09-24)

The paragraphs above describe the state **before** this commit and are kept
as the record of it. What shipped:

`dealQuality.sealedRowMatchesItsProduct` now **fails closed**. A new
`sealedProductIdentity(product)` returns `null` unless the embedded product
is a plain object (not null, not an array, not a primitive) carrying a
**non-blank string** `name`; the validator returns `false` on `null`.
Nothing is inferred from neighbouring fields — `set`, `tcgplayer_id` and
the row's own title are not substitutes for the name. `set` and
`product_type` remain optional and are passed through trimmed, so a
properly populated row reaches the same verdict it did before. Both
functions are exported so the boundary is testable directly, not only
through the display gate.

**Before → after**

| Input | Before | After |
|---|---|---|
| product absent / `null` / `undefined` | **accepted** | rejected |
| `name: null` / `""` / whitespace-only / non-string | **accepted** | rejected |
| product not an object, or an array | **accepted** | rejected |
| only `set` + `tcgplayer_id`, no name | **accepted** | rejected |
| populated product, title matches | accepted | accepted (unchanged) |
| populated product, title mismatches | rejected | rejected (unchanged) |

**Live impact: none.** Measured across all 727 stored sealed rows before
shipping — 0 rows (0 active) have a null FK, an unresolvable product or a
blank product name. Displayable is 134 under the shipped gate and 134 under
a fail-open counterfactual on the same read. This removed a latent hazard,
not a live row.

**Tests.** SI-17 was inverted **in the same commit as the implementation**
and now proves rejection across all the shapes in the table above, asserted
at both the validator and the display gate. SI-17b proves the boundary does
not depend on how the row was produced (database shape, hand-assembled,
JSON round-trip). SI-17c drives a nameless fixture through the real detail
route and requires "This listing is unavailable here",
`robots.index = false` and no product name in the HTML. All three were
verified to fail when the fail-open is temporarily restored. One fixture
was *completed, not weakened*: `sealed-match-17c9` S-7 built its product as
`{ set }` only; its subject is early availability, not identity, so it now
carries the real catalogue name it always implied.

**SI-18 remains defence in depth for projection hygiene and is explicitly
not the correctness boundary.** It is a static text scan that can only see
the embeds it matches in the files it is given; the runtime validator is
what guarantees rejection regardless of file, query spelling, embed syntax,
hand-built objects or future callers. A caller that now drops `name` hides
rows rather than showing wrong ones — safe, but still a bug worth catching
early, which is why the scan is kept.

**Caller audit.** Every direct caller of `isDisplayableSealedDeal` /
`isSealedVerificationCandidate` was checked: the sealed detail route,
`sealedDisplayable` (pool, paged grid, catalogue offers), `lib/sitemap.js`
and `lib/sealedVerifyLane.mjs`. All embed `name`; none depends on nameless
products being accepted. `r6-category-currency` stubs the gate and is
unaffected.

**Production verification** (deployment `dpl_5Xpu2ZV…`, commit `40e0847`,
tree byte-identical to the tested commit): legitimate sealed deal 2462
still renders "Champion's Path Elite Trainer Box · 69% below market before
shipping"; kind-mismatch rows 2435, 961, 933 and 525 all render
"unavailable here", noindex, with no product name; sealed sitemap 0/40 and
sealed index 0/8 quarantined. The malformed/nameless case has no
production HTTP path — creating such a row would be a data mutation — so it
is verified through the real route module at the deployed commit
(fixture-only, SI-17c).

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

3. **262 active unresolved rows.** The shipped identity rule refuses them,
   for reasons outside this finding, so they are hidden today — but
   *refused* is not *established as incorrect*, and nothing in this pass
   assessed them. Active split: 116 `edition_mismatch:30th_vs_25th`, 84
   `booster_bundle_vs_booster_box`, 23 `quantity_lot`, 11
   `edition_unstated:25th`, 7 `collection_vs_booster_box`, 5
   `etb_vs_booster_box`, 3 each `case_vs_etb` / `case_vs_booster_box` /
   `pokemon_center_etb_vs_etb`, 2 each `booster_box_vs_etb` /
   `deck_vs_booster_box`, 1 each `build_battle_stadium_vs_booster_box` /
   `build_battle_box_vs_booster_box` / `collection_vs_etb`. (333 in total
   across active and inactive.) Each group needs its own evidence review
   before any of them is called a defect.

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
