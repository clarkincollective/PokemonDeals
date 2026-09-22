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
