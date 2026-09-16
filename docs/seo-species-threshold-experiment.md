# SEO species catalogue-indexability threshold experiment

Internal record so we can evaluate the cohort in Search Console later
instead of forgetting what changed. **Not a public page.**

`SPECIES_CATALOG_MIN_CARDS` (lib/speciesHub.js) is the number of real,
priced, imaged catalogue cards a Pokemon must have for its
`/pokemon/[slug]` page to be indexable with no live deal. The live-deal
path (`SPECIES_MIN_LISTINGS = 5`) is unchanged and unrelated.

---

## Experiment 1 — threshold 8 → 6

| Field | Value |
|---|---|
| Phase | SEO Phase 2B |
| Deployment date | 2026-09-01 |
| Old threshold | `SPECIES_CATALOG_MIN_CARDS = 8` |
| New threshold | `SPECIES_CATALOG_MIN_CARDS = 6` |
| `SPECIES_MIN_LISTINGS` | 5 (unchanged) |
| New species URLs entering the index | **72** |
| From the exactly-6-eligible group | 39 |
| From the exactly-7-eligible group | 33 (34th, Shedinja, was already indexable via the live-deal path) |

### Baseline (before the change)

| Metric | Value |
|---|---|
| Valid `/pokemon/[slug]` routes | 1,025 |
| Indexable | 848 |
| Noindex | 177 |
| `/sitemaps/pokemon.xml` `<loc>` count | 848 |

### Target (after the change)

| Metric | Value |
|---|---|
| Valid `/pokemon/[slug]` routes | 1,025 |
| Indexable | 920 |
| Noindex | 105 |
| `/sitemaps/pokemon.xml` `<loc>` count | 920 |

### Exact 5 / 6 / 7 / 8 eligible-card distribution (production, at baseline)

Predicate: `isEligibleSpeciesCard(card, species)` (real card + Pokemon
`card_type` or null + species leads the name) **AND** `catalogPriceOk`
**AND** `image_url` — the exact predicate `fetchCatalogSpecies` /
`fetchSpeciesCatalog` / the sitemap already use.

| Eligible cards | Species | Was indexable | Was noindex | Every card `/cards`-resolvable | Spans ≥3 sets | Priced coverage (over identity-eligible) | Image coverage |
|---:|---:|---:|---:|---:|---:|---:|---:|
| exactly 5 | 34 | 0 | 34 | 34/34 | 32/34 (2 span 2 sets) | 72.7% | 100% |
| exactly 6 | 39 | 0 | 39 | 39/39 | 39/39 | 79.5% | 100% |
| exactly 7 | 34 | 1 (deal) | 33 | 34/34 | 34/34 | 75.6% | 100% |
| exactly 8 | 45 | 45 | 0 | 45/45 | 45/45 | 78.8% | 100% |

The exactly-6 and exactly-7 cohorts have the **same** structural profile
as the already-indexed exactly-8 cohort: 100% image coverage, 100% of
eligible cards `/cards/[slug]`-resolvable, every species spanning 3+
sets, full card-number coverage, comparable priced coverage.

### The 72-species cohort — alphabetical

Archen, Aromatisse, Barbaracle, Baxcalibur, Binacle, Blacephalon,
Bounsweet, Cetitan, Cetoddle, Clamperl, Comfey, Cosmoem, Cranidos,
Dachsbun, Dipplin, Dondozo, Drizzile, Espathra, Farigiraf, Fidough,
Finneon, Flamigo, Flittle, Garganacl, Glameow, Gorebyss, Gourgeist,
Gumshoos, Happiny, Huntail, Iron Crown, Iron Moth, Iron Treads, Kartana,
Kleavor, Komala, Kricketot, Lurantis, Mabosstiff, Maushold, Mime Jr.,
Morgrem, Mothim, Nickit, Nymble, Okidogi, Pincurchin, Poipole, Purugly,
Raboot, Rolycoly, Sandy Shocks, Scatterbug, Shiinotic, Sinistcha,
Sliggoo, Sneasler, Snom, Spewpa, Spinda, Staravia, Tarountula, Tatsugiri,
Ting-Lu, Tinkatuff, Toedscool, Toedscruel, Torracat, Walking Wake,
Wiglett, Wugtrio, Wyrdeer.

### The 72-species cohort — by National Dex number

327 Spinda, 366 Clamperl, 367 Huntail, 368 Gorebyss, 397 Staravia,
401 Kricketot, 408 Cranidos, 414 Mothim, 431 Glameow, 432 Purugly,
439 Mime Jr., 440 Happiny, 456 Finneon, 566 Archen, 664 Scatterbug,
665 Spewpa, 683 Aromatisse, 688 Binacle, 689 Barbaracle, 705 Sliggoo,
711 Gourgeist, 726 Torracat, 735 Gumshoos, 754 Lurantis, 756 Shiinotic,
761 Bounsweet, 764 Comfey, 775 Komala, 790 Cosmoem, 798 Kartana,
803 Poipole, 806 Blacephalon, 814 Raboot, 817 Drizzile, 827 Nickit,
837 Rolycoly, 860 Morgrem, 871 Pincurchin, 872 Snom, 899 Wyrdeer,
900 Kleavor, 903 Sneasler, 917 Tarountula, 919 Nymble, 925 Maushold,
926 Fidough, 927 Dachsbun, 934 Garganacl, 943 Mabosstiff, 948 Toedscool,
949 Toedscruel, 955 Flittle, 956 Espathra, 958 Tinkatuff, 960 Wiglett,
961 Wugtrio, 973 Flamigo, 974 Cetoddle, 975 Cetitan, 977 Dondozo,
978 Tatsugiri, 981 Farigiraf, 989 Sandy Shocks, 990 Iron Treads,
994 Iron Moth, 998 Baxcalibur, 1003 Ting-Lu, 1009 Walking Wake,
1011 Dipplin, 1013 Sinistcha, 1014 Okidogi, 1023 Iron Crown.

Almost entirely Gen 3–9 middle evolutions and Gen 9 paradox Pokemon.
No Trainer/Energy false matches, no species-classification errors.

### Species that stay noindex after this change

- **exactly-5-eligible group (34):** all remain noindex. Includes the
  control case **Finizen** (5 eligible, dex 963). Also Type: Null,
  Gholdengo, Munchlax, Wynaut, Iron Hands, Iron Leaves, Nihilego,
  Eldegoss, Dracozolt, Enamorus, Hydrapple, etc.
- **1–4-eligible group:** all remain noindex.
- Total noindex after: **105** (34 at exactly-5, 71 at 1–4).

---

## Search Console follow-up (fill in later — do NOT fabricate)

Evaluate ~4–8 weeks after the deployment date above.

| Metric | Value | Checked on |
|---|---|---|
| Cohort URLs discovered (Coverage) | _tbd_ | |
| Cohort URLs indexed | _tbd_ | |
| Cohort impressions (28-day) | _tbd_ | |
| Cohort clicks (28-day) | _tbd_ | |
| Representative queries | _tbd_ | |
| Cohort average position | _tbd_ | |
| Decision (hold at 6 / go to 5 / revert to 8) | _tbd_ | |

If the cohort indexes cleanly and picks up impressions with no
manual-action / thin-content signal, the next experiment is
**6 → 5** (which would pull in the 34-species exactly-5 group,
Finizen included). See §"Recommendation" in the Phase 2B report.

---

## Experiment 2 — Pokemon page enrichment pilot (SEO-2.3)

A different lever from Experiment 1. That one changed **which** species
pages are indexable. This one changes **what** a treated page says, for a
bounded cohort, with a matched untreated control recorded in advance.

| Field | Value |
|---|---|
| Phase | SEO-2.3 |
| Deployment date | 2026-09-16 |
| Treated cohort | 26 species (6 from 17C.4/17C.5 + 20 new) |
| Control cohort | 20 species, matched, pre-registered, untreated |
| Untreated remainder | ~948 indexable species |
| Cohort source of truth | `SPECIES_PILOT_SEO23` / `SPECIES_CONTROL_SEO23` in `lib/speciesCoverage.js` |
| Baseline GSC window | 2026-08-18 to 2026-09-16 (28 days) |

### Treatment

1. **Title.** `{Species} Cards: Prices, Values & Card List`, replacing
   `{Species} Cards – Full List, Prices & Values`. The control keeps the
   old title. "Full List" was dropped because the page's own FAQ says these
   are "the cards we price and monitor", "not necessarily the set's full
   printed checklist", and each page reports how many of its cards have no
   reliable reference. Deterministic 3-rung length ladder, cap 65.
2. **Meta description.** `Browse {n} cards we track for {Species} across
   {sets} sets, spanning {eras} eras. Compare card prices, values and
   current marketplace deals where available.` Counts come from
   `speciesCoverageFacts` over the `isEligibleSpeciesCard`-filtered list the
   body renders, so metadata and body can never disagree. Era clause is
   withheld below 2 dated eras. Singular/plural handled.
3. **Body.** The existing era-checklist / coverage treatment, unchanged,
   now applied to the expanded allowlist. No new component, no new prose.

**No prices in metadata.** Minimum, maximum, median, largest discount and
live-deal count are all real but move with every sync and scan. The
metadata architecture deliberately avoids churn. Current references stay
visible in the page body where they already were.

### Cohorts

**Treated (20 new):** Pikachu, Charizard, Mewtwo, Lucario, Rayquaza,
Snorlax, Umbreon, Espeon, Moltres, Lugia, Vaporeon, Voltorb, Glaceon,
Palkia, Kangaskhan, Blaziken, Absol, Aegislash, Registeel, Feraligatr.

**Control (20, matched, untreated):** Eevee, Raichu, Meowth, Gyarados,
Gardevoir, Vulpix, Venusaur, Articuno, Crobat, Darkrai, Latias, Clefairy,
Sylveon, Luxray, Ho-Oh, Altaria, Mawile, Malamar, Ludicolo, Pidgeot.

Pairs were matched on eligible card count, set count and era count. The
weakest pair is Pikachu (359 cards) against Eevee (123) — Pikachu is an
outlier with no close match.

Selection rule: indexable, >=13 eligible cards, >=5 dated eras, and card
pages that already earned Search Console impressions in the baseline
window. Deliberately not head terms only — the cohort spans 359 cards
(Pikachu) down to 18 (Registeel).

**Charizard included, reversing the 17C.5 exclusion.** That note said "25
undated sets - not manageable yet". Re-measured 2026-09-16: 62 sets, 18
undated, 71% dated — level with Arcanine (72%) and Cleffa (71%), better
than Dragonite (69%).

**Popplio rejected** despite the third-highest card-page demand in the
catalogue (13 impressions): 9 sets, 3 dated (33%), 2 eras. The era
checklist would be mostly "undated". Feraligatr replaced it (33 cards,
21 sets, 8 eras, 67% dated, 7 card impressions).

**Pikachu carries the cohort's weakest dating** at 58%. Included because
`speciesEraGroups` reports undated sets as undated rather than guessing.

### Baseline (2026-08-18 to 2026-09-16, `/pokemon/` pages)

| Cohort | Pages with impressions | Impressions | Clicks | Distinct queries |
|---|---:|---:|---:|---:|
| Existing pilot (6) | 3 | 25 | 0 | 22 |
| **Treated, 20 new** | **0** | **0** | **0** | **0** |
| **Control (20)** | **0** | **0** | **0** | **0** |

Per-species baseline, only those with any impressions: Dragonite 18
impressions / 15 queries, Cleffa 5 / 5, Electrode 2 / 2 — all three from
the existing pilot.

Test and control both start at exactly zero, so any divergence is
attributable. Note the circumstantial prior: the only three Pokemon pages
on the site with impressions are all already-treated species, while the 20
highest-demand untreated species (Pikachu and Charizard card pages earn 24
and 39 impressions) had zero hub impressions.

### Measurement

Primary window **6 to 8 weeks**. Review dates: **2026-10-28** (6 weeks)
and **2026-11-11** (8 weeks). Earlier checks are for crawling, indexing and
regressions only — not ranking conclusions.

Primary signals, treated versus control: impressions per indexed page,
distinct queries per page, growth in species/list/value query impressions,
clicks, and CTR once samples allow. Dragonite's 15 distinct queries is the
benchmark for query diversity.

Average position is **secondary**: an expanding query mix can make
aggregate position look worse while the experiment is succeeding.

Do not change either cohort during the window unless a production issue
forces it.
