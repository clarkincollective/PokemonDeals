# SEO set-hub catalogue expansion (Phase 4A)

Internal record so we can evaluate the cohort in Search Console later.
**Not a public page.**

## Old architecture

`/sets/[slug]` existed only when a set had `SET_MIN_LISTINGS = 3`
simultaneous active below-market deals (`computeAggregates` /
`resolveSetSlug` matched the deal-backed list). A real catalogue set with
priced, imaged cards and permanent `/cards/[slug]` pages but no live deal
had **no page at all** — inconsistent with the catalogue-backed
`/pokemon/[slug]` and `/cards/[slug]` architecture, and unable to serve
`{set} card list / checklist / prices / values` intent.

## New architecture

Two indexable paths, one template (`app/sets/[slug]/page.js`):

- **Deal-backed** — `SET_MIN_LISTINGS = 3` (unchanged). Shopping-first.
- **Catalogue-backed** — `SET_CATALOG_MIN_CARDS` real, priced, imaged,
  stable-id English catalogue cards (`setEligibleCard` ==
  `catalogCardIndexable` — the exact predicate the cards sitemap and the
  species hub use). No live deal required. `resolveSetSlug` falls through
  to `fetchCatalogSets()`; the sitemap unions both lists.

New template sections (shared components, deal-backed gets them too): set
fact strip, set price summary (distribution, never a complete-set
valuation), most-valuable cards, card checklist, **Pokemon in {set}**
(the Set → Pokemon edge Phase 0 found missing), quick answers. A
catalogue-only set renders no "Best deals" shell and states plainly that
there is no qualifying below-market deal.

## Chosen catalogue threshold

**`SET_CATALOG_MIN_CARDS = 10`** (eligible catalogue cards).

### Rationale

Production audit of the 68 catalogue sets with no page:

| eligible cards | sets | published | missing | avg %priced | avg %img | avg %num |
|---:|---:|---:|---:|---:|---:|---:|
| 1–4 | 2 | 0 | 2 | 70% | 100% | 100% |
| 5–9 | 3 | 0 | 3 | 46% | 100% | 100% |
| 10–24 | 36 | 16 | 20 | 91% | 100% | 99% |
| 25–49 | 23 | 9 | 14 | 82% | 100% | 90% |
| 50–99 | 45 | 35 | 10 | 86% | 100% | 96% |
| 100+ | 103 | 87 | 16 | 88% | 100% | 97% |

Missing sets by threshold: **8 → 62**, **10 → 60**, 12 → 59, 15 → 50,
20 → 47, 25 → 40.

- At **10**: 60 newly-indexable, all with 100% image coverage, ~90–100%
  card-number coverage, real market references, real species. The
  weakest members (McDonald's yearly promos: 12 real priced Pokemon
  cards, 100% numbered, refs $3.76–$44) are genuine "{year} McDonald's
  Pokemon cards checklist / prices" targets.
- Below **10** the remainder is thin: "MEE: Mega Evolution Energies"
  (8, all basic Energy), "ME: 30th Celebration" (6), "Kids WB Promos"
  (2), "Hidden Legends" (1 — a catalogue naming artefact), plus three
  0-eligible deck-kit / sample "sets". None is a real card-list target.
- Going higher (15+) drops the legitimate McDonald's / small Trainer-Kit
  sets for no quality gain.

Same numeric value the browse grid already used; now the indexability
gate too. `SET_MIN_LISTINGS` stays 3.

## Scale

| Metric | Before | After |
|---|---:|---:|
| Total English catalogue sets | 215 | 215 |
| Deal-backed `/sets/[slug]` pages | 147 | 147 |
| Catalogue-backed `/sets/[slug]` pages | 0 | **60** |
| **Indexable set pages** | **147** | **207** |
| Below-threshold sets (no page) | 68 | **8** |
| `/sitemaps/sets.xml` `<loc>` count | 148 | **~208** |

## The 60-set cohort

**Major modern expansions** (missing a page only for lack of live deals):
SV01 Scarlet & Violet Base Set, SWSH01 Sword & Shield Base Set, SWSH02–06
/ 08–12, SWSH: Crown Zenith, XY Base Set, Black and White, Emerging
Powers, Noble Victories, SM – Forbidden Light, SM – Crimson Invasion,
Shining Fates, Champion's Path, Pokemon GO, Celebrations, ME02:
Phantasmal Flames, ME04: Chaos Rising, Double Crisis, SWSH12: Silver
Tempest Trainer Gallery.

**Legitimate promo / kit / academy sets:** Battle Academy (+ 2022 / 2024),
Kalos Starter Set, First Partner Pack, Trick or Trade BOOster Bundle
(+ 2023 / 2024), Countdown Calendar Promos, McDonald's Promos 2011 /
2012 / 2014 / 2015 / 2017 / 2022 / 2023 / 2024, McDonald's 25th
Anniversary Promos, Burger King Promos, Pikachu World Collection Promos,
Rumble, Professor Program Promos, EX Battle Stadium, EX Trainer Kit 1 & 2,
DP Trainer Kit: Manaphy & Lucario, BW Trainer Kit: Excadrill & Zoroark,
XY Trainer Kit: Bisharp & Wigglytuff / Latias & Latios / Sylveon &
Noivern, SM Trainer Kit: Alolan Sandslash & Alolan Ninetales / Lycanroc &
Alolan Raichu.

**Specialty / Energy:** World Championship Decks (1588 eligible, 295
species — a 1960-card deck-reprint grab-bag; browse grid capped at 600,
price summary falls back to all-priced since every card is specialty-set,
`cardTier` still applies elsewhere), SVE: Scarlet & Violet Energies (33
basic-Energy cards — real niche checklist; the "Pokemon in {set}" section
correctly renders nothing).

## Stays noindex (8, missing, < 10 eligible)

McDonald's Promos 2016 (9), MEE: Mega Evolution Energies (8), ME: 30th
Celebration (6), Kids WB Promos (2), Hidden Legends (1), Ash vs Team
Rocket Deck Kit (0), First Partner Collection 2026 (0), e-Reader Sample
Cards (0).

## Quality-audit findings

PASS. Of the 60, ~40 STRONG, ~18 ACCEPTABLE, 2 borderline-ACCEPTABLE
(Professor Program Promos — Trainer-heavy, 1 species; SVE Energies — no
species). 0 TOO THIN. Every set: 100% image coverage, real market
references, resolvable permanent `/cards/[slug]` for every eligible card,
genuinely distinct structured content (identity, cards, sets, prices,
species) — not doorway pages.

## Search Console follow-up (fill in later — do NOT fabricate)

| Metric | Value | Checked on |
|---|---|---|
| Cohort URLs discovered | _tbd_ | |
| Cohort URLs indexed | _tbd_ | |
| Cohort impressions (28-day) | _tbd_ | |
| Cohort clicks (28-day) | _tbd_ | |
| Representative queries | _tbd_ | |
| Cohort average position | _tbd_ | |
| Decision (hold at 10 / lower / revert) | _tbd_ | |

Deployment date: 2026-09-01. Old threshold: n/a (no catalogue path).
New threshold: `SET_CATALOG_MIN_CARDS = 10`.
