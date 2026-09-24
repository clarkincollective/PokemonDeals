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
| 4 | Sealed links lose the product selection | **closed** — commits `e45a18d`, `927fcb8`, 2026-09-25; production-verified desktop + 387px, see below |
| 5 | `customid=other` on some affiliate links | **closed** — commits `67e1c1f`, `a6c4ae3`, 2026-09-25; measured 83.2% → 0.0% fallback in production, see below |
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

---

# The 262 active unresolved sealed rows — read-only classification (2026-09-24)

Investigation phase only. **No production data was mutated**: the freeze
script (`scripts/remediation/sealedUnresolvedFreeze.mjs`) contains no
`update`, `insert`, `upsert`, `delete` or `rpc` call, and a re-read of all
262 rows after the analysis found 0 differing from the frozen copy and 0
carrying any `disqualified_reason`. Finding 1's containment, identity rule
and historical reconciliation are untouched.

Language is used strictly: **"unresolved" means correctness has not been
established.** "Rejected by the rule" does not mean the listing is wrong,
and "accepted by the rule" would not mean it is verified correct.

## Frozen cohort

`.local/remediation/sealed-unresolved-frozen-2026-09-24.json` (gitignored)
— read at **2026-09-24T06:17:20.139Z**, 727 table rows, cohort **262**.
Every deal id, title, linked product (id/name/set/tcgplayer_id/active),
listing state, disqualification state, the exact matcher input, the
sub-verdicts and a per-gate breakdown are retained per row.

Reproducibility check: the id set is **identical** to the active unresolved
rows in the 2026-09-23T22:34:49Z snapshot — 0 in one read only, in either
direction, across 7.7 hours.

## Disjoint category table (first match wins inside `sealedListingDecision`)

| # | Refusal reason | n | hidden by identity ALONE | also another reason | image-confirmed |
|---|---|---|---|---|---|
| 1 | `edition_mismatch:30th_vs_25th` | 116 | 0 | 116 | 0 |
| 2 | `kind_mismatch:booster_bundle_vs_booster_box` | 84 | 80 | 4 | 0 |
| 3 | `quantity_lot` | 23 | 21 | 2 | 0 |
| 4 | `edition_unstated:25th` | 11 | 11 | 0 | 0 |
| 5 | `kind_mismatch:collection_vs_booster_box` | 7 | 7 | 0 | 2 |
| 6 | `kind_mismatch:etb_vs_booster_box` | 5 | 5 | 0 | 0 |
| 7 | `kind_mismatch:case_vs_etb` | 3 | 3 | 0 | 1 |
| 8 | `kind_mismatch:case_vs_booster_box` | 3 | 3 | 0 | 0 |
| 9 | `kind_mismatch:pokemon_center_etb_vs_etb` | 3 | 2 | 1 | 0 |
| 10 | `kind_mismatch:booster_box_vs_etb` | 2 | 2 | 0 | 0 |
| 11 | `kind_mismatch:deck_vs_booster_box` | 2 | 2 | 0 | 0 |
| 12 | `kind_mismatch:build_battle_stadium_vs_booster_box` | 1 | 1 | 0 | 0 |
| 13 | `kind_mismatch:build_battle_box_vs_booster_box` | 1 | 1 | 0 | 0 |
| 14 | `kind_mismatch:collection_vs_etb` | 1 | 0 | 1 | 1 |
| | **Total** | **262** | **138** | **124** | **4** |

Display consequence, measured on the frozen snapshot: **138** rows are
hidden solely because of the identity refusal; **124** have at least one
other independent reason (116 `listingNamesDifferentExpansion`, 8
`auctionEnded`). **0** of the 262 are displayable under the shipped gate.
These are frozen-snapshot figures and are not to be explained with a later
live read.

Exact ids per category are retained in the frozen JSON under `byReason`.

## Disposition per category

| # | State | Root cause | Proposed action (NOT implemented) |
|---|---|---|---|
| 1 | Correct refusal; the **link** is stale, not the listing | All 116 are 2026 "30th Anniversary Celebrations ETB" listings bound to the **2021** product 242811. The correct product **704143 exists and is actively watched** — these rows were written before the alias shipped and have not been re-seen by 704143's own scan | **verification lane / re-link** |
| 2 | Correct refusal by title; different SKU | A Booster Bundle (6 packs) is not a Booster Box (36). 71 Booster Bundle products exist in `sealed_catalog` but **0 are in `sealed_watchlist`**, so no scan can ever re-home them | **catalogue/watchlist coverage** |
| 3 | Correct refusal; multi-unit or part-box | "x4", "(13) LOT", "Lot of 2", "18x packs 1/2 Half Booster Box". 9 **Half Booster Box** products are watched, so part of this group has a correct home | **re-link (half-box subset) / no action (true lots)** |
| 4 | Correct refusal; **mis-categorised** | 10 of 11 are single-card-shaped (Greninja Gold Star SWSH144 promos). Rule 3 (edition) fires before rule 4 (kind), so they carry an edition reason rather than `single_card`. Already refused; no display harm. Finding 1's cohort count was an undercount of the single-card population by these 10 — **recorded only; finding 1 is not reopened** | **no action** |
| 5 | Mixed | #513 image-confirmed a 3-card mini-pack display; #519 image-confirmed loose packs (~151 cards). Both refusals **right**. Remainder unassessed | **needs manual evidence** |
| 6 | Correct refusal; different product type | ETB listings bound to Booster Box products | **re-link** |
| 7 | **Contains a confirmed false refusal** | #221 image-confirmed a genuine sealed Champion's Path ETB in a clear protective case — refused because the `case` rule sits above `etb` and `PROTECTIVE_CASE` does not cover a bare "+ Case". #930/#931 are German "Case **leer**" (empty) — right refusal, wrong reason | **matcher improvement** |
| 8 | Correct refusal; wrong reason | All three are empty cases stated in German/Italian ("LEER OHNE KARTEN", "VUOTO NO CARTE") that the English-only `empty_box` rule misses | **matcher improvement (low urgency — already refused)** |
| 9 | Correct refusal | 2 are Pokemon Center ETB Plus bound to the standard ETB; product **270709 is watched**. 1 is an Italian "sealed case of 4 ETBs" | **re-link** |
| 10 | Ambiguous | "Champion's Path Elite Trainer **Booster** Box *READ DESCRIPTION*" — the seller wrote both product types | **needs manual evidence** |
| 11 | Correct refusal | Starter deck display, not a booster box | **no action** |
| 12–13 | Correct refusal | Build & Battle Stadium / Box are separate SKUs at different prices | **no action** |
| 14 | **Confirmed false refusal** | #937 image-confirmed a genuine sealed German **"Top-Trainer-Box"** — the official German retail name for the Elite Trainer Box. `productKindOfTitle` returns `collection` because the `collection` rule matches a bare `\bbox\b` | **matcher improvement (product alias)** |

## Systematic rule gaps found

1. **Stale product links dominate.** 116 of 262 (44%) are one link error
   against one product, with the correct product already watched. A data
   problem, not a matcher problem.
2. **Watchlist coverage gap.** 84 of 262 (32%) are Booster Bundles whose
   catalogue product exists but is not watched.
3. **`\bbox\b` inside the `collection` rule is a catch-all.** It swallows
   `Booster-Box` (hyphenated), `Top-Trainer-Box` and other compound forms
   before a more specific rule can see them. Confirmed by direct probe:
   `"…Booster-Box 1x"` → `collection`; `"…Booster Box"` → `booster_box`.
4. **Product aliases / localisation are unhandled.** "Top-Trainer-Box"
   (German ETB) is refused; `Boosterbox` (one word) resolves to no kind.
5. **`case` outranks `etb` / `booster_box`.** A genuine box sold *in* a
   case is refused unless the case carries one of six English adjectives.
6. **"Empty" is detected only in English.** 6 rows use `leer` /
   `ohne Karten` / `vuoto` / `no carte` / `Incomplete`.
7. **Rule ordering hides the true category** for 10 single-card rows.

## Evidence strength

| | Rows |
|---|---|
| Independently confirmed (listing image inspected) | **4** — #221, #937 (refusal wrong); #513, #519 (refusal right) |
| Title-evidence-only reading recorded | **258** |
| Called "wrong", "valid" or "correct" without independent evidence | **0** |

## Ranked remediation proposal (not implemented)

| Rank | Action | Rows | Safety |
|---|---|---|---|
| 1 | Re-link the 116 30th rows onto watched product 704143 via the verification lane | 116 | High — target exists, is watched, and the reassignment path already clears the old comparison |
| 2 | Add Booster Bundle products to `sealed_watchlist` | 84 | High — additive; no existing row's classification changes |
| 3 | Matcher: stop `\bbox\b` swallowing compound forms; add the `Top-Trainer-Box` alias; let a genuine box in a bare "+ Case" stay a box | ≥2 confirmed, up to 11 in scope | Medium — changes an ordering rule; needs a finding-1 style measured dry run first |
| 4 | Re-link the ETB / Pokemon-Center / Half-Box subsets | ≤10 | High |
| 5 | Matcher: non-English "empty" wording | 6 | Low urgency — all already refused; improves the recorded reason only |
| 6 | Manual evidence for the ambiguous remainder | ~9 | N/A |

Nothing above is scheduled. No row will be quarantined, re-linked,
deactivated or rewritten until a dry run for that specific action has been
reviewed.

## Stage 1 — 116 stale 30th Celebration links (DONE, 2026-09-24)

`scripts/remediation/sealed30thRelink.mjs`. Cohort taken from the frozen
snapshot, never from a fresh query. 0 of 116 had drifted since the freeze.

**The destination was proved per row, not assumed.** Every candidate title
was run against **all 196 active watched products** through the real
two-stage scanner path — `dealMatching.listingMatchesSealedProduct` via
`sealedNameMatch` (so the scoped 30th alias applies exactly as at
ingestion), then `sealedListingDecision`. A row qualified only when
**exactly one** product accepted it.

| | rows |
|---|---|
| deterministic (exactly one accepting product) | **115** |
| manual review | **1** |
| → destination 123 *30th Celebration Elite Trainer Box* | 114 |
| → destination 122 *30th Celebration **Pokemon Center** ETB* | 1 |

That single Pokemon Center row (#250) is why the per-row proof was
required: the cohort pattern would have sent it to the standard ETB.

**#1386 stayed in manual review** — *"**Pokémon** Center Elite Trainer Box
30th Celebrations - READ DESCRIPTION"*. The correct product (122) accepts
it at the identity stage but **fails the name-token stage**, because the
title spells it `Pokémon` with an accent and the product name spells it
`Pokemon`; the token matcher does not strip diacritics. Proved by re-running
the matcher on an accent-stripped copy of the same title, which passes. A
**diacritic-normalisation gap**, recorded for Stage 4 — not guessed here.

### Two canaries failed closed before anything was written

The first canary wrote **0 rows**: `market_price` is `NOT NULL`, so the
comparison could not simply be emptied. The second also wrote **0 rows**:
`discount_pct` is `NOT NULL` too. (An earlier probe suggested it was
nullable; that probe was invalid — it targeted `id = -1`, matched no rows,
so the constraint was never evaluated. The canary is what established the
truth.) The write was then defined as:

- `market_price` ← the **destination product's own** `sealed_catalog`
  reference, copied verbatim (173.73 for 704143, 303.80 for 704144). A
  lookup, not a computation, and never the old product's 353.12.
- `discount_pct` ← `0`, the encoding of **no discount asserted**.
  `hasPositiveComparison` requires `pct > 0`, so such a row cannot claim a
  saving, cannot enter a discount-ranked view and cannot enter the sitemap.
  No discount is derived here; the destination's own scan rewrites it.
- `reference_*` ← cleared. The old product's evidence can never describe
  the new one.

### Results

Canary of 2 (one per destination) verified at DB, ownership, duplicate,
display-gate, detail-route and sitemap level, then the remaining 113.
**115/115 written**, and every written row re-read afterwards:

| check | result |
|---|---|
| landed on the proposed destination | 115/115 |
| identity rule now accepts | 115/115 |
| making a savings claim | **0** |
| still carrying a stale reference | **0** |
| displayable | 0 — all held by the 17C.7 pre-release guard |
| eligible for the verification lane | 115 |
| unintended column changes | **0** |

Ownership moved 76 → 122/123 as planned (product 76: 184→69 rows; 123:
0→114; 122: 0→1). The 31 duplicate `listing_id`s in the manifest are all
cross-marketplace, so no unique-key conflict arose.

**Visible effect:** the relinked detail pages remain noindex and out of the
sitemap, but their gated notice now names the correct release — *"30th
Celebration released 16 September · this listing predates it"* — where it
previously derived from the 2021 set. The relink corrected the copy as well
as the data, and surfaced nothing new.

Active unresolved cohort **262 → 147**; `edition_mismatch:30th_vs_25th`
**116 → 1**. Focused sealed suites 75/75; ratchet OK, quarantine 25.
Rollback files: `sealed-30th-prior-canary-…json`,
`sealed-30th-prior-remainder-…json`.

## Stage 2 — Booster Bundle watchlist coverage: HALTED at Phase C, nothing written

`scripts/remediation/sealedBundleAudit.mjs` (SELECT only). Audit artefact:
`.local/remediation/sealed-bundle-audit-2026-09-24.json`. **No production
data was mutated in Stage 2.** No product was added to `sealed_watchlist`,
no row was relinked, no canary was run.

### Figure correction to the accepted read-only report

That report said *"71 Booster Bundle products exist in `sealed_catalog`"*.
That matched on **name + set**. The catalogue's own classification is
`product_type`, and matching **name + product_type** gives **171**. The two
reconcile exactly:

| | products |
|---|---|
| name says "Booster Bundle" — the earlier 71 | **71** = 8 needed + 63 with no current rows |
| name does not, but `product_type` does | **100** — `Sleeved Booster Pack Bundle [Set of 8]`, `Booster Pack Art Bundle [Set of 4]` … |
| **catalogue total by `product_type`** | **171** |

The 100 are a **different SKU class** (multi-pack / art / sleeved), not the
single modern Booster Bundle the 84 rows describe, and are excluded.

### Phase A — 171 products, disjoint groups

| group | n |
|---|---|
| 1 — needed for current unresolved rows | **8** |
| 2 — legitimate Booster Bundle, no current rows | 63 |
| 3 — different SKU class (pack / art / sleeved variant) | 100 |
| 4 — inactive / no reference / non-English | 0 |
| 5 — ambiguous, manual review | 0 |
| **total** | **171** |

None of the 171 is currently watched. The 8 needed:

| rows | tcgplayer | product | ref | marketplaces |
|---|---|---|---|---|
| 42 | 692942 | Pitch Black Booster Bundle | 38.37 | AU 21, CA 14, IT 7 |
| 16 | 684456 | Chaos Rising Booster Bundle | 36.37 | AU 10, CA 2, IT 4 |
| 13 | 672396 | Perfect Order Booster Bundle | 38.93 | AU 6, CA 6, GB 1 |
| 4 | 610953 | Journey Together Booster Bundle | 45.50 | CA 2, AU 2 |
| 2 | 625670 | Destined Rivals Booster Bundle | 64.64 | CA 1, AU 1 |
| 1 | 644362 | Mega Evolution Booster Bundle | 63.80 | AU 1 |
| 1 | 654160 | Phantasmal Flames Booster Bundle | 88.05 | AU 1 |
| 1 | 679564 | Surging Sparks Booster Bundle (Retail) | 61.42 | AU 1 |

### Phase B — the 84 rows

| verdict | rows |
|---|---|
| exactly one Booster Bundle destination | **80** |
| no valid Booster Bundle destination | **4** |
| multiple bundle destinations | 0 |
| accepted by an existing watched product | 0 |

**0 rows are contested** by an already-watched product, so there is no
duplicate-ownership competition. A row having exactly one accepting product
is *not* a finding that the row is correct — only that one destination is
available.

### Phase C — two blockers, either one sufficient to stop the stage

**Blocker 1 — the schedule cannot see these listings.** The only scheduled
sealed scan is `0 20 7 * * *  /api/refresh-sealed-deals?country=EBAY_US` —
one marketplace. The cohort is **AU 46, CA 26, IT 11, GB 1; EBAY_US 0 of
84**. Watching a Booster Bundle product would search EBAY_US only and would
never encounter any of these 84 listings. **Adding the products cannot
re-home a single row on the current schedule**, whatever the budget allows.

**Blocker 2 — the sealed browse budget is already at capacity.**
`lib/browseBudget` funds sealed at a hard **200 Browse calls/day**, and
`refresh-sealed-deals` spends **one call per product per marketplace**.

| scenario | watched products | calls/run | cap | headroom | coverage if capped |
|---|---|---|---|---|---|
| current | 196 | 196 | 200 | **4** | 100% |
| + 3-product canary | 199 | 199 | 200 | 1 | 100% |
| + the 8 needed | 204 | 204 | 200 | **−4** | 98% |
| + all 71 name-matched | 267 | 267 | 200 | −67 | 75% |
| + all 171 | 367 | 367 | 200 | −167 | 54% |

Even the minimal addition — the 8 products actually needed — **exceeds the
cap**. Adding all 171 would leave the lease short, and `acquireBrowseLease`
would grant a partial pass: roughly **46% of the existing watchlist would
stop being scanned each day**. That is a coverage regression for products
that work today, in exchange for products that still could not see their
listings because of Blocker 1.

Scanning the needed products in the four marketplaces the rows actually
occupy would cost **(196+8) × 6 = 1,224 calls/day against a 200 cap** if the
cron were unscoped.

### Conclusion

Stage 2 is **halted before Phase D**, under the stage's own instruction not
to proceed if expansion risks destabilising scan quotas or schedules. The
blocker is not the watchlist — it is the **marketplace scope of the sealed
cron** and the **200/day sealed budget**. Both are provider-budget and
scan-schedule decisions, which are explicitly outside what this work may
change, and both are the owner's call.

Two options for the owner, neither taken here:

1. **Re-allocate the sealed budget** (currently 200/day, taken from
   `sweep:EBAY_US`) and **add a non-US sealed cron pass**, then re-run this
   stage. The 8 needed products in AU + CA + IT + GB would cost ~816
   calls/day on top of today's 196.
2. **Accept the 84 as safely refused.** They are hidden, make no savings
   claim, and carry no false product name. Correctness for them remains
   *unestablished*, not *wrong*.

Note the pre-existing INV-10 failure (Browse went over the global 5,000/day
envelope on 2026-09-21, 5,035) — the global budget is already stressed,
which makes option 1 a real trade-off rather than a free addition.

### Stage 2 cost correction (2026-09-24, read-only)

**The ~816 figure above was the wrong unit of work.** It priced *widening
the entire 204-product sweep* across four marketplaces. The remediation
needs only the **8** Booster Bundle destinations, and each only where its
rows actually exist:

| product | AU | CA | IT | GB | calls | rows |
|---|---|---|---|---|---|---|
| Pitch Black Booster Bundle | 21 | 14 | 7 | — | 3 | 42 |
| Chaos Rising Booster Bundle | 10 | 2 | 4 | — | 3 | 16 |
| Perfect Order Booster Bundle | 6 | 6 | — | 1 | 3 | 13 |
| Journey Together Booster Bundle | 2 | 2 | — | — | 2 | 4 |
| Destined Rivals Booster Bundle | 1 | 1 | — | — | 2 | 2 |
| Mega Evolution Booster Bundle | 1 | — | — | — | 1 | 1 |
| Phantasmal Flames Booster Bundle | 1 | — | — | — | 1 | 1 |
| Surging Sparks Booster Bundle (Retail) | 1 | — | — | — | 1 | 1 |
| **total** | | | | | **16** | **80** |

**16 product-marketplace calls/day**, not 816 — and below the 32 ceiling of
"8 × 4 marketplaces", because marketplace-aware scheduling queries each
product only where its cohort is.

**Blocker 2 as originally written was wrong.** `browseBudgetMode()` returns
**`off`**; the ledger rows are `browse_budget_observe:`. The caps record
hypothetical decisions and **do not gate grants today**, so the 200/day
sealed cap would not have truncated anything. The real constraint is eBay's
external 5,000/day limit, and measured consumption shows there is no
headroom:

| window ending | total | sealed | sweep:US (cap 790) | allocated | verify | ingest | unleased |
|---|---|---|---|---|---|---|---|
| 2026-09-24 | 4,988 | 196 | 1,091 | 2,345 | 440 | 305 | 0 |
| 2026-09-23 | 4,788 | 196 | 932 | 2,307 | 400 | 384 | 0 |
| 2026-09-22 | 4,995 | 196 | 1,006 | 2,339 | 420 | 360 | 22 |
| **2026-09-21** | **5,035** | 196 | 998 | 2,220 | 440 | 423 | **95** |
| 2026-09-20 | 5,028 | 196 | 1,051 | 2,369 | 380 | 353 | 35 |
| 2026-09-19 | 5,000 | 196 | 1,018 | 2,311 | 440 | 360 | 0 |

**The 5,035 day explained:** no single consumer overshot its own share by
much; the total is the sum of every consumer running unthrottled because the
budget is in `off` mode. `sweep:EBAY_US` alone spent **998 against a 790
cap** (and 1,091, 1,051, 1,018 on other days) — it is the largest and most
redundant over-spender, running 96 times a day over the same query set. 95
calls that day were `unleased:` — made outside any lease at all. So the
envelope is breached by unenforced drift, not by one runaway job.

**Blocker 1 stands and remains decisive**: the scheduled sealed scan is
EBAY_US only, and 0 of the 84 rows are in EBAY_US.

### Answers to the targeted-lane questions

1. **Matrix / calls** — above: **16/day** marketplace-aware, 32 if each
   product were scanned in all four union marketplaces.
2. **Can the scanner take a subset?** `refresh-sealed-deals` reads only
   `minDiscount` and `country`. **Explicit marketplace: yes, today.
   Product subset: no. Priority queue: no.** A subset would need a new
   parameter; the scan/ownership semantics beneath it (`ingestSealedListings`,
   the identity decision, the guarded write) need no change at all, because
   a targeted lane is the same scan over fewer products.
3. **Can it use spare global capacity?** **No.** The envelope is strictly
   zero-sum and asserted: group caps 4,580 + reserve 420 = 5,000, and the
   reserve is explicitly never grantable to a consumer lease. 16 calls must
   be *taken from* a consumer, not found. The natural donor is
   `sweep:EBAY_US` for the same reason sealed-rev1 used it: 96 runs/day over
   one query set, so 16 calls is ~2% of its cap and costs a fraction of one
   page per run.
4. **Lowest-cost architecture (proposed, NOT built):** a
   **marketplace-aware priority scan** — a small table or config of
   `(tcgplayer_id, marketplace)` pairs that `refresh-sealed-deals` reads
   when given e.g. `?lane=priority`, scanning exactly those pairs under its
   own small lease key. It preserves the 196-product US sweep untouched,
   reuses the existing matcher, ownership and guarded-write paths verbatim,
   creates no duplicate scans (the pairs are disjoint from the US sweep),
   and writes no special-case data — a relinked row is written by the normal
   ingest path, not by a remediation script. Prefer this general capability
   over a one-off script.

**Still to decide by the owner, before anything is built:** whether to take
16 calls/day from `sweep:EBAY_US`, and whether to address the unenforced
budget (`off` mode) that is letting the envelope drift over 5,000.

## Stage 3 — deterministic relinks to already-watched products (DONE, 2026-09-24)

`scripts/remediation/sealedDeterministicRelink.mjs`. Same proof and same
write contract as Stage 1. Scope: the frozen 262 **minus** the 84
booster-bundle rows (Stage 2, still held), **minus** #1386 (Stage 1 manual
review), **minus** the 116 `edition_mismatch` rows Stage 1 owns = **62 in
scope**, 0 drifted.

| | rows |
|---|---|
| deterministic (exactly one accepting watched product) | **2** |
| no active watched product accepts the title | 60 |

Both are `kind_mismatch:etb_vs_booster_box`: #150 and #159, *"POKEMON TCG
SV09 Journey Together Elite Trainer Box | ETB 9 Booster Packs"*, bound to
the Journey Together **Booster Box** and relinked to the Journey Together
**Elite Trainer Box** (product 63). **Image-confirmed** a genuine Journey
Together ETB before writing — these are the first rows in this remediation
that become customer-visible, so title evidence alone was not enough.

Canary of 1 (#150) verified at DB, ownership, duplicate, display-gate,
detail-route and sitemap level, then #159. **2/2 written**, both re-read:
identity accepts, `market_price` = the destination's own 138.02,
`discount_pct` = 0, references cleared, **no savings claim**, 0 unintended
column changes. Ownership: product 63 4→5 active, product 9 (Booster Box)
12→10. No duplicate-ownership conflict.

**Production:** `/sealed-deals/150` now reads *"Journey Together Elite
Trainer Box"* where it previously said Booster Box, renders no `% below
market`, and stays noindex (a plain listing with no evidenced reference).

The 60 with no accepting watched product are **left unresolved**, not
written and not judged. Focused sealed suites 61/61; ratchet OK, quarantine
25. Unresolved cohort **147 → 145**.

---

# Finding 4 — sealed links lose the product selection (CLOSED, 2026-09-25)

Commits `e45a18d` (implementation) and `927fcb8` (one production-found gap).

## Root cause

`lib/guideLinks.js` already carried each named product's exact catalogue
identity (`tcgplayerId`) and then threw it away:

```js
function product({ name, set, productType, tcgplayerId, label }) {
  return Object.freeze({ ..., href: "/sealed-deals" });   // hardcoded
}
```

So every named sealed product in a guide landed on the unfiltered
catalogue of 2,354 products across 151 sets, and the reader had to find
the product again — including the two cases a set link or a text search
*cannot* resolve, because both editions share every distinguishing word:

| product | id |
|---|---|
| 151 Elite Trainer Box | 503313 |
| 151 Pokemon Center Elite Trainer Box (Exclusive) | 501999 |
| Prismatic Evolutions Elite Trainer Box | 593355 |
| Prismatic Evolutions Pokemon Center Elite Trainer Box (Exclusive) | 593324 |

A second cause sat underneath it: `/sealed-deals` *could* filter but the
state was not addressable. The page read no search parameters and the
browser wrote none, so a filtered view had no URL to link to.

## Why `?product=<tcgplayerId>` and not the existing `/sealed-deals/[id]`

`/sealed-deals/[id]` already exists, but its `id` is a **`sealed_deals`
row** — one live listing. It exists only while an offer exists, and its id
is not stable catalogue identity. Nine of the ten audited guide products
have no qualifying offer today, so that route could not serve them at all.
`tcgplayerId` is the catalogue's own identity and exists regardless of
whether anything is for sale.

## What shipped

- `lib/sealedFilterUrl.js` (new, pure) — parse/build the filter URL, one
  `VALID_PRODUCT_ID = /^[0-9]{1,20}$/`, and **one** exclusivity rule:
  selecting a product drops the browse filters; touching a browse filter
  drops the product. Unrelated parameters (`utm_*`, `gclid`, …) are never
  touched.
- `app/api/sealed-catalog/route.js` — `?product=` exact lookup, placed
  *before* the set/text paths. Malformed → 400 `invalid_product`; unknown
  → 404 `unknown_product`. Neither falls through to a text search.
- `components/SealedProductBrowser.js` — a "Selected product" panel, URL
  as the single source of filter state, `popstate` restore, and
  suppression of the page's unrelated "Live sealed deals right now" strip
  while a product is claimed.
- `proxy.js` — `X-Robots-Tag: noindex, follow` on filtered states only.
  Done in the proxy, not the page, so `/sealed-deals` stays static (○) and
  CDN-cached; the unfiltered page's indexing policy is unchanged.
- `scripts/integrity/verifyGuideLinks.mjs` — now derives each product's
  href and rejects duplicate destinations. Live: 146 cards, 10 products,
  21 sets, **0 problems**.
- `tests/scanner/sealed-product-selection-2026-09-25.test.mjs` — SP-1…14.
- `tests/scanner/guide-card-links.test.mjs` test 1b had **pinned the
  defect** (`assert.equal(p.href, "/sealed-deals")`); it now pins the new
  contract.

## Production verification, 2026-09-25

Desktop (1440-wide window) and a **measured 387 CSS px** layout viewport.
`resize_window` reported success but the Chrome window stayed maximised at
1920, so the mobile pass was measured in a same-origin 390px iframe and
`window.innerWidth` recorded with each result rather than assumed.

| check | result |
|---|---|
| five audited guides emit exact product links | 501999 / 502005 / 503313 / 593324 / 593355 / 600518 / 242436 / 668541 / 672434 / 453470 |
| remaining bare `/sealed-deals` links | generic link text only ("Sealed", "Sealed Products", "Sealed product listings") |
| all 10 destinations resolve live | yes |
| editions distinct | 151 std ref A$684.67 vs 151 Pokemon Center ref A$1,815.68 |
| product with a live offer (593355) | panel renders tile + "1 live listing" + View on eBay |
| zero-offer products (the other 9) | "No eBay listing currently passes our checks for this exact product… alternatives, not this product" |
| invalid id (`abc`) | API 400 `invalid_product`; page says "Product not found" |
| unknown numeric id (`999999999`) | API 404 `unknown_product`; page says nothing below is that product |
| empty `?product=` | 200, ordinary browse |
| Clear selection | URL → `/sealed-deals`, panel gone, strip restored |
| Back / Forward | `?product=593355` ⇄ `/sealed-deals`, panel and strip both restored |
| 8 keystrokes in the search box | URL tracked every keystroke; `history.length` delta **0** |
| exclusivity, live | typing on `?product=593355&utm_source=guide&utm_campaign=prismatic` → `?utm_source=guide&utm_campaign=prismatic&q=charizard` — product dropped, **both attribution parameters kept** |
| `X-Robots-Tag` | `/sealed-deals` → none; `?product=…` → `noindex, follow`; `?q=…` → `noindex, follow`; `?utm_source=guide` → none |
| canonical | still `/sealed-deals`; no filtered URL in any sitemap |
| 387px viewport | no horizontal overflow (scrollWidth 368 ≤ 387); panel present; strip hidden; CTA 252×36 |

### The one gap production found — fixed in `927fcb8`

A **malformed** id left the featured strip showing, so a reader who
followed a broken product link met a rotation of *other* products above
the "Product not found" notice. A numeric-but-unknown id already hid it.
The strip's condition was `Boolean(selectedId)`; the panel's was
`selectedId || selectedState === "invalid"`. They now share one
`productClaimed` flag and SP-6 fails if they diverge again.

## Known limitation (measured, not fixed)

At 387px the panel starts **545px** down the page, below the site header
and the page's existing hero, so a reader following a product link scrolls
roughly two-thirds of a screen before seeing it. Once scrolled, the whole
panel including the eBay CTA fits in one 841px screen. This is the page's
pre-existing header/hero, not something finding 4 introduced, and removing
it was outside this task.

**No traffic or revenue improvement is claimed from this change.** What is
established is that a guide link now resolves to the exact product and
edition it names, and says so plainly when it cannot.

---

# Finding 5 — affiliate attribution (CLOSED, 2026-09-25)

Commits `67e1c1f` (implementation) and `a6c4ae3` (one defect the production
check found). Full contract, vocabulary and reporting guidance:
`docs/ebay-affiliate-attribution.md`, "FINDING 5" section.

## Measured before changing anything

Census of the **rendered production HTML**, read-only: it fetches page
HTML and inspects hrefs, never requesting an `ebay.com` or
`partner.tcgplayer.com` URL, so it generated no click, impression, order
or commission.

| route | outbound eBay hrefs | on `other` |
|---|---|---|
| `/sealed-deals` and `?product=` | 178 each | 100% |
| `/japanese-cards` | 24 | 100% |
| `/latest-releases` | 12 | 100% |
| `/guides/pokemon-151-buying-guide` | 3 | 100% |
| `/`, `/deals`, `/best-finds`, `/pokemon/[slug]` | 88 | 0% |
| **total** | **475** | **395 = 83.2%** |

## Two causes

1. Real surfaces were never added to the closed enum — `sealed`,
   `sealed_hub`, `guide_offers`, `japanese_cards`, `latest_releases`. A
   test in the suite **pinned** `sealed_hub` and `japanese_cards` as
   `"other"`, locking the gap in. Same shape as finding 4's
   `guide-card-links` test 1b.
2. One token answered two questions — `home_best` fuses page and module,
   so the sealed browse grid and the selected-product panel had no way to
   differ.

## What shipped

`customid = "<page>-<placement>"` (`subId1` on Impact), both halves closed
`Set`s of literal strings. Longest producible value 17 chars against EPN's
documented 256; `encodeURIComponent` is a no-op on all of them; an unknown
half degrades to an explicit `other`.

**The page is never the acquisition source.** A reader arriving from a
guide and clicking on `/sealed-deals` is `sealed`, not `guide`. The
landing source already lives — and only where it is reliably captured — in
the analytics landing context (`traffic_source` / `utm_*` /
`landing_page_type` / `attribution_scope`, set by `AnalyticsBootstrap`),
and is deliberately not copied into a network parameter.

**The networks are kept apart.** `customid` and `subId1` are built by
different functions so neither can inherit the other's parameter name;
only the identifier value is shared, which is the PostHog join key.

## Production verification, after deploy

`node scripts/integrity/verifyAffiliateAttribution.mjs` — 12 routes, **690
attributed outbound hrefs, 0 problems, fallback 0.0%** (from 83.2%).

| | share |
|---|---|
| `sealed-search` | 489 · 70.9% |
| `sealed-feature` | 48 · 7.0% |
| `pokemon-search` | 37 · 5.4% |
| `deals-grid` / `japanese-grid` / `card-search` | 24 each · 3.5% |
| `latest-grid` | 16 · 2.3% |
| `home-all` · `sealed-grid` · `best_finds-grid` · `home-best` · `guide-offer` · `pokemon-grid` | 28 total |
| **`other-other`** | **0** |

Live DOM checks (read-only, no link followed):

- `?product=593355` selected panel → `customid=sealed-selected`, `campid`
  intact, destination `/itm/326988324164` intact, `rel="sponsored noopener
  noreferrer"`, `data-affiliate-link` present.
- `?product=503313` zero-offer panel → `customid=sealed-search`, `_nkw`
  and `_sacat` intact.
- Homepage: 13 sponsored anchors, **0 unmarked**, all attributed
  (`home-all` 9, `home-best` 4).

## Two event-integrity defects found while tracing, both fixed

1. **Double count on `/search`.** The result-card wrapper's `onClick`
   fired on any click inside the card, including the affiliate CTA, which
   emits its own `affiliate_click` — two Vercel and two PostHog events for
   one action, inflating the search surface. Affiliate anchors now carry
   `data-affiliate-link` and the wrapper stands down for them.
2. **Silent under-count in the catalogue.** The tile's "Find on eBay" was
   a bare `<a>` with its own `track()`: Vercel event yes, `affiliate_click`
   no, so it was invisible to the growth report. Now uses the shared
   `EbaySearchLink`. A test fails if a sponsored anchor is ever added
   outside the two emitting components.

## The defect the production check found — `a6c4ae3`

Live DOM inspection of `?product=503313` showed the CTA correctly
attributed **and carrying `campid=null`**. A link with no campaign id
earns nothing — worse than `other`.

Root cause is this session's recurring shape: **a comment claiming
something nothing checked.** `slimSealedProduct` dropped `ebayHref` for
page weight (audit-r1) and said the href was *"rebuilt by SpeciesCard from
`searchQuery` with the same builder (campaign id and surface intact)"*.
The campaign-id half was false: SpeciesCard rebuilds wherever it renders,
and for an API-delivered product that is the browser, where
`EBAY_CAMPAIGN_ID` is server-only and undefined.

Pre-existing, not introduced by finding 5. Affected every client-loaded
sealed tile — sets beyond the six the page prerenders, any filtered
result, and the selected-product panel, which is always client-loaded and
is exactly where a guide link lands.

Fixed by having the API (server-side, can read the campaign id) send the
campaign-wrapped href; the page's own props still omit it, so the
page-weight saving is unchanged. The census now also reads the API's JSON
and fails if a delivered product has no href or no `campid`.

## Preserved, and asserted

`campid`, `mkevt`, `mkcid`, `mkrid`, `toolid`, `_nkw`, `_sacat`, the
destination item or search, marketplace routing and client-side
localisation, the Impact tracking base and its `u=` destination byte for
byte, `rel="sponsored noopener noreferrer"`, `target="_blank"`, the
cookieless analytics posture and its daily session boundaries, and every
existing event name and property.

## Limits of this verification

- **Instrumentation is verified; network-recorded activity is not.**
  Recorded clicks, orders and commission in EPN and Impact require
  subsequent real visitor activity and cannot be asserted from shipping.
- **The Impact `subId1` change is verified structurally only.** It is
  Impact's documented partner sub-ID parameter and the tracking base and
  destination are pinned unchanged, but whether it surfaces in *this
  account's* reporting needs a real click, which this work deliberately
  does not generate.
- Historical `other` rows are unchanged and not back-filled. **This
  deployment starts the improved measurement period**; an EPN row from
  before it means "we could not tell", not "surface: other".

**No traffic, revenue or commission improvement is claimed from the
implementation alone.**
