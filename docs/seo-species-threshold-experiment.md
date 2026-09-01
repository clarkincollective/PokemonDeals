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
