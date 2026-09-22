# Pullnomics audit implementation — checklist

Working record for the 12-item scope. Updated as work completes.

Baseline: commit `d8291cf`, 28 guides, ratchet 33 failing / 33 quarantined.

## Catalogue coverage established before writing (first-party, 2026-09-22)

| Set | Catalogue `set` value | Cards |
|---|---|---|
| 151 | `SV: Scarlet & Violet 151` | 215 |
| Prismatic Evolutions | `SV: Prismatic Evolutions` | 355 |
| Crown Zenith | `SWSH: Crown Zenith` + `SWSH: Crown Zenith: Galarian Gallery` | 249 across both |
| Surging Sparks | `SV08: Surging Sparks` | 262 |

All four therefore have real destinations and real per-card identities to cite.

## Items

| # | Item | URL | Status |
|---|---|---|---|
| 2 | Move classic-collection → Identify your card | `/guides` | Done — regrouped index, 37 guides each placed once |
| 1 | 151 buying guide | `/guides/pokemon-151-buying-guide` | Done |
| 2b | Booster box vs ETB vs bundle | `/guides/booster-box-vs-etb-vs-booster-bundle` | Done |
| 3 | Graded-certificate verification | `/guides/check-graded-pokemon-card-certificate` | Done — written without attributing wording to any grader (see limitations) |
| 4 | Japanese vs English | `/guides/japanese-vs-english-pokemon-cards` | Done |
| 5 | Prismatic Evolutions | `/guides/prismatic-evolutions-buying-guide` | Done |
| 6 | Holo vs reverse holo | `/guides/holo-vs-reverse-holo-pokemon-cards` | Done |
| 7 | Crown Zenith / Galarian Gallery | `/guides/crown-zenith-galarian-gallery-guide` | Done |
| 8 | Surging Sparks Pikachu | `/guides/surging-sparks-which-pikachu` | Done |
| 9 | Expand price/worth: references vs completed sales | `/guides/how-much-is-my-pokemon-card-worth` | Done — expanded in place, no second URL |
| 10 | Expand sealed guide: packaging + listing checks | `/guides/pokemon-booster-box-prices` | Done — expanded in place, no second URL |
| 11 | Complete set vs master set | `/guides/complete-set-vs-master-set` | Done |
| 12 | Shipping-cost study (Market Data) | `/market-data/pokemon-shipping-cost-study` | Done — frozen artifact `lib/studies/shippingCost202609.js` |

## Registry expectations updated (not weakened)

`tests/scanner/guide-card-links.test.mjs` records an independent verification
snapshot of every card and product a guide cites. Extended for this batch:

- **VERIFIED**: 20 new card identities, each re-read from `card_catalog` on
  2026-09-22 (`tcgplayer_id`, `name`, `set`, `card_number`) with the canonical
  URL re-derived from the row's own stored name and set. 0 mismatches.
- **VERIFIED_PRODUCTS**: 7 new sealed identities, re-read from
  `sealed_catalog` the same way. `s151BoosterPack` was registered but pictured
  by no guide, so it was removed from the registry rather than left as an
  unverifiable claim.
- Test 1's set-href check extended to the 5 new `GUIDE_SETS` entries.
- Test 1b's "pictures the three pack counts" loop now names those three
  products explicitly (a product registered for a *different* guide can no
  longer satisfy it) and a new assertion fails any verified product that no
  guide pictures. Net: stricter than before.
- Tests 3 and 5 (per-guide contextual-link counts; the guide slug list) were
  extended for the 9 new guides. The protections they enforce — bounded links
  per guide, no link dumps, `guideMetadata` canonicals, no robots override —
  still run over every file in the list.

Ratchet after the batch: **33 failing / 33 quarantined**, `tests/known-failing.json`
unchanged.

## Inbound links added from pre-existing guides

The audit's point is that new pages must be reachable from the existing corpus,
not only from each other.

- `how-to-find-pokemon-card-set-and-number` → Surging Sparks (one set, four
  Pikachu ex numbers), Crown Zenith GG numbering, holo vs reverse holo (the
  foil-treatment bullet), Japanese vs English (the language bullet).
- `how-pokemon-card-prices-work` → 151 and Prismatic, as the modern-rarity-tier
  version of the "one name, several prices" split.
- `organise-pokemon-30th-celebration-collection` → complete set vs master set,
  as the general form of the scope decision it already asks the reader to make.

## Evidence rules applied

- Every card/product cited resolves to a real `card_catalog` / `sealed_catalog` row.
- No hard-coded market prices in prose.
- No pull rates, EV model or condition multipliers.
- Catalogue coverage is described as what we track, never as a complete official checklist.

## Source limitations

- **PSA and CGC return HTTP 403 to automated fetches.** The audit quoted PSA
  wording for item 3; it could not be verified from here, so the
  certificate-verification guide describes the *process* (find the number,
  check it against the grader's own lookup, compare what the lookup returns
  against the slab in the photographs) and attributes no wording to any
  grader. It names no grader-specific policy we could not read.
- **No pull-rate data exists in our system**, so no guide states or implies
  one, and no expected-value figure appears anywhere in this batch.
- The shipping study's population is **retained listings we had eligible at
  one observation cutoff**, not a sample of the market. Listings with an
  unconfirmed shipping charge were excluded, not treated as zero.

## Not claimed

Publishing these pages is not evidence of traffic, ranking or revenue change.
Nothing in this record asserts any such outcome.

---

# Correction pass (2026-09-22, after dc8defd / 3f1c6d0)

## 1. Sourcing and verification dates

All nine guides claimed "Last checked against the official sources" while
citing none. Primary sources were then actually read, in a browser where the
host refuses automated retrieval, and cited beside the claims they support
(`lib/guideSources.js`, rendered by the existing `Src` / `SourceList`
components).

| Guide | Primary source now cited | `updated` retained? |
|---|---|---|
| 151 buying guide | Official ETB, Pokemon Center ETB, Ultra-Premium and expansion pages | Yes |
| Booster box vs ETB vs bundle | Six official product pages + Pokemon Support pack contents | Yes |
| Graded certificate | PSA Cert Verification | Yes |
| Japanese vs English | Play! Pokemon TCG Tournament Handbook (rev. 1 Sep 2026) | Yes |
| Prismatic Evolutions | Official Prismatic ETB / PC ETB / bundle / expansion pages | Yes |
| Holo vs reverse holo | Pokemon Support pack contents ("reverse foil") | Yes |
| Crown Zenith / Galarian Gallery | Official Crown Zenith ETB page | Yes |
| Surging Sparks | **None** — every claim is first-party catalogue | **Removed** |
| Complete set vs master set | **None** — the subject is that no official definition exists | **Removed** |

`components/GuideLayout.js` now always renders the publication date, and
appends the official-source clause only where `updated` is set. Before, a
guide with no `updated` rendered no date line at all, which hid a genuine
publication date in order to avoid a claim it never needed to make.

PSA's guidance is cited **for PSA only** and the guide says so in its own
text: verification does not eliminate risk, counterfeiters copy real
certification numbers from public sources, and PSA does not view items listed
online or warrant them. The genuine lookup link is now in the guide.

## 2. Product comparisons finished

"Small handful" and "mid-size run" are gone. Three comparison tables now carry
exact product, region/language, pack count, promos, accessories and the goal
each suits, every row verified against that product's own official page:

- **Format guide** — 6 products. The three Elite Trainer Boxes hold **9, 10
  and 11** packs, which is the point: the format word is not a pack count.
- **151 guide** — standard ETB (9 packs, 1 Snorlax promo) vs Pokemon Center
  ETB (11 packs, 2 Snorlax promos, one with the Pokemon Center logo), plus the
  Ultra-Premium Collection (16 packs).
- **Prismatic guide** — standard ETB (9), Pokemon Center ETB (11), bundle (6),
  and the Dollar General edition listed with its contents recorded as **not
  published** rather than inferred from the catalogue title.

## 3. Unsupported generalisations removed

| Guide | Removed | Replaced with |
|---|---|---|
| Crown Zenith | "The Gallery has no cheap tier" | The rarity counts (66 Ultra Rare, 4 Secret Rare of 70) plus an explicit statement that a rarity label is not a price |
| Surging Sparks | "Usually 238/191 … circulates in photographs"; "a Hyper Rare priced like a Double Rare is more often mislabelled than a bargain" | A statement that we hold no popularity or listing-error data, so we do not answer it |
| Japanese vs English | Set-size, release-order and product-size claims about both lines | The verified Play! Pokemon rating-zone language table, and the handbook's statement that Japanese backs are treated as marked |
| Holo vs reverse holo | The "where the foil sits" table and the "quick check in a photograph" rule | An explicit section on what the guide will not do, and why |
| Complete set vs master set | "Usually / often / sometimes" frequency columns; "commons usually cost less than people fear" | A decisions table with a narrow and a broad reading per row |
| Prismatic | "more printings than almost anything else in modern Pokemon" | 101 of 181 collector numbers resolve to more than one record |
| Prismatic | Espeon 033/131 described as two printings | It is **three** — base, Poke Ball, Master Ball (our error, found on re-verification) |

**Holo guide, stated limitation.** No permitted photography demonstrating foil
behaviour under light could be obtained, and our card images are flat
catalogue scans. The article's promise was narrowed accordingly: it no longer
teaches identification by eye, no diagram stands in for a photograph, and the
gallery caption states explicitly that the scans are evidence of *which
records exist*, not of how any finish behaves.

## 4. Shipping study corrected

**Denominator error.** The page said including the excluded listings would
have "inflated the sample by roughly 60%". 60.7% is their share of the
deduplicated population; adding them back grows the analysed sample by 154.4%.
Both ratios are now derived from the artifact and both are stated, with their
own denominators named.

**Eligibility.** The comparable-group key was `card | marketplace |
condition`. It now also keys on language, `is_graded`, grader, grade and
recorded delivery basis. Exact card, printing and language were already
guaranteed by `card_tcgplayer_id` (distinct printings hold distinct ids; the
catalogue holds one language per id) — the page says so rather than implying
those fields were absent.

**Ties.** "Sort and take the first" made an arbitrary choice among listings
tied for the lowest item price, which can manufacture a reversal. A reversal
is now counted only when *no* listing tied for the lowest item price reaches
the lowest delivered total.

Measured on one fetch of the same rows, the decomposition is:

| Group key | Tie handling | Reversals |
|---|---|---|
| Old (`card·marketplace·condition`) | naive | 12 of 55 (21.8%) |
| Old | tie-safe | 10 of 55 (18.2%) |
| New (+ language, graded, grader, grade, delivery basis) | naive | 9 of 50 (18.0%) |
| **New** | **tie-safe (shipped)** | **7 of 50 (14.0%)** |

Of the old groups the stricter key split, **18 were split by delivery basis**
(a domestic and a cross-border offer in one group); grading and language
separated none in this sample. Three groups would have been miscounted as
reversals by the naive tie-break.

**Snapshot honesty.** The original run froze aggregates only; no row-level
evidence was retained, and `deals` prices are overwritten in place, so the
earlier 14-of-54 figure **could not be re-verified**. The study was therefore
recomputed in full at a new, explicitly labelled cutoff under the corrected
method (`methodRevision: 2`), and the page carries a dated correction notice
saying the figures come from that recomputation and none is carried over. It
is not presented as the earlier snapshot.

**Withdrawn claims:** "sorting by item price picks the wrong listing about a
quarter of the time" and "how much it matters depends almost entirely on which
marketplace the listing is on". The reversal figure is now stated as a result
about the assessed groups, explicitly not a rate.

**Scope gained.** `shippingState()` returns "confirmed" only for shipping > 0,
so every counted listing *charges* for shipping. The page now says so: these
are not averages over all listings.

**Calculation checks:** `tests/scanner/shipping-cost-study.test.mjs`, six
tests — the population funnel reconciles, the two exclusion ratios use their
own denominators and cannot substitute for one another, the reversal figure is
bounded by its groups and accounts for every usable row, the group key carries
all eight identity fields and the tie-safe rule is present in the generator,
each marketplace row is self-consistent in one currency and the rows account
for every usable listing, and the page derives its ratios from the artifact
rather than stating a hand-typed rate.

## 5. Mobile verification

Resizing the browser window was insufficient — Chrome's minimum window width
is well above 390px, so the page never reflowed. Verified instead by framing
each page at a measured **390 CSS-pixel** viewport and asserting
`innerWidth === 390` before measuring.

All 12 changed pages at 390px and 5 at 1280px: **zero page-level horizontal
overflow**, and zero elements escaping their container outside a dedicated
horizontal scroller. Wide tables scroll within their own containers.

**Defect found and fixed:** `GuideTable` rendered its caption as a `<caption>`
inside the table, so the caption inherited the table's `min-width` and was
clipped by the scroller — on a phone, the caption of a 56rem table could only
be read by dragging sideways one line at a time. The caption is now a
paragraph outside the scroll container, wrapping to the screen (measured: 325px
wide, 5 lines, right edge 349 of 390) and tied to the table with
`aria-describedby`.
