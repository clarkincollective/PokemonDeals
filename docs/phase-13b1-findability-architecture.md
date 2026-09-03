# Phase 13B.1 — Universal Findability: Discovery Architecture & Intent Contract

**Status:** architecture + audit only. No search rewrite, no homepage change, no ranking change, no new SEO routes, no AI parsing. This document is the contract 13B.2–13B.6 implement against.

**Date:** 2026-09-03 · **Against:** production commit `f6185cb` (13A.3), DB as of audit.

---

## 0. TL;DR — the three P0 root causes

| # | Failure (Phase 12D) | Root cause (this audit) |
|---|---|---|
| 1 | `graded pikachu` → 618 catalogue results, "graded" ignored | `/api/card-search` passes the raw string straight to PokemonPriceTracker's `/cards?search=`. PPT drops the token — proven: `graded pikachu` total (618) === `pikachu` total (618). Nothing in our code parses "graded", and **grading is a *listing* attribute (`deals.is_graded/grader/grade`), not a *card* attribute** — there is nothing in `card_catalog` to filter on. Graded intent must route to **deals filtered `is_graded=true`**, not a catalogue text search. |
| 2 | `pikachu psa 10` → 6,015 results, `10` treated as number-noise | PPT matches the bare `10` against every card whose collector number contains 10 — `pikachu psa 10` total (6,015) vs `pikachu` (618). **Our own `lib/searchRanking.js` makes it worse**: `queryNumbers()` extracts `/\b(\d{1,3})\b/` as a collector number and `scoreCatalogResult` adds `+45` to any card numbered 10. Neither PPT nor our code knows `PSA 10` = grader + grade. Must parse `<grader> <grade>` as one unit and remove it from the catalogue-name query. |
| 3 | `charizard 4/102` doesn't surface the 1999 Base Set print | PPT returns only its own top-2 `#4/102` matches (Celebrations Classic Collection + ME 30th reprint). Base Set Charizard is somewhere in PPT's 241-result total but **not on page 1**, and `rerankCatalogResults` only reorders *the page already returned* — it never sees Base Set. Must resolve `name + collector_number` against **our local `card_catalog`** (27,919 / 29,309 rows carry `card_number`), where name + number + era precedence puts the iconic print first. |

Plus: **no Pokemon × graded × grade × price path exists** (§7), and **search latency is a request-fan-out + no-cancellation problem, not a single slow call** (§11).

---

## 1. Current search architecture map

There are **two unrelated discovery subsystems** with no shared model.

### 1a. The price-checker (`/search` → `/api/card-search`)

```
HeroSearch / SearchClient (client)
  │  350ms debounce · no AbortController · no stale-response guard
  ▼
GET /api/card-search?q=&page=&country=&sort=      [dynamic = "force-dynamic", no cache]
  │
  ├─ findExistingDeals(db, q, {country, sort})
  │     watchlist  WHERE language='english' AND name ILIKE '%q%'  LIMIT 500     ← seq ILIKE scan, no trigram idx (8,634 rows)
  │     deals      WHERE watchlist_id IN (…ids…) AND is_active                  ← then .filter(isDisplayableDeal)
  │
  ├─ searchCards(q, {limit:20, offset})   →  PokemonPriceTracker  GET /v2/cards?search=q   ← EXTERNAL, 0.3–0.6s, no local fallback
  │
  ├─ findDealsForCatalogPage(db, tcgIds, {country})   ← Supabase, depends on PPT result page
  ├─ resolveCatalogHrefs(db, tcgIds)                  ← Supabase card_catalog lookup, depends on PPT result page
  │
  └─ rerankCatalogResults(enriched, q)   ← lib/searchRanking.js: in-memory reorder of the 20 PPT rows only
        scoreCatalogResult(): exact name +100 / all name tokens +55 / prefix run +30
                              exact set phrase +40+10·tokens / partial set overlap
                              collector-number match +45  ← treats bare "10" as a number
                              specialty (Jumbo/WCD) −80 unless "jumbo/oversized/world championship" in query
```

**Response shape:** `{ deals: [...displayable deals], catalog: { page, pageSize, total, hasMore, results: [{tcgplayerId, name, displayName, set, cardNumber, rarity, imageUrl, marketPrice, cardHref, deal}] } }`

**Filter UI on `/search`:** `country` (6 marketplaces) + `sort` (discount / price_asc / price_desc) only. **No graded/raw, no grade, no price, no listing-type, no language, no condition, no set filter.**

**Second endpoint** — `GET /api/card-search?tcgplayerId=…` (`cardDetail`) — *does* accept `condition`, `country`, `graded` (`true`/`false`), `listingType` (`FIXED_PRICE`/`AUCTION`), `minDiscount`, `maxPrice` and filters `deals` accordingly. **This per-card filter capability already exists and is unused by the search UI.**

### 1b. Route-based discovery (`lib/deals.js` resolvers)

| Route | Resolver | Source | Filter model |
|---|---|---|---|
| `/cards/[slug]` | `resolveCardSlug` → `fetchCardHubs` (2+ live listings) → else `card_catalog` fallback (`pickCatalogMatch`, `splitCardSlug`) | deals + `card_catalog` | per-card deal filters (country/graded/listing/condition/price) via `?tcgplayerId=` API |
| `/pokemon/[slug]` | `resolveSpeciesSlug` → `fetchSpeciesHubs` (`SPECIES_MIN_LISTINGS`+ active listings) | deals aggregated by `extractSpecies(watchlist.name)` + `card_catalog` (`speciesPriceSnapshot`) | `fetchSpeciesDealsPage({cardType, listingType, maxPrice, minPrice})` — **no grader/grade** |
| `/sets/[slug]` | `resolveSetSlug` → `fetchSets` (deal-backed) → else `fetchCatalogSets` (`SET_CATALOG_MIN_CARDS`) | deals + `card_catalog` | `FilterBar` grid params |
| `/deals/[id]` | direct `deals` row by id | deals | none (single listing) |
| `/deals/[category]` | `DEAL_CATEGORIES` (`lib/dealCategories.js`): `under-25/50/100`, `graded` (`{cardType:"graded"}`), `auctions` (`{listingType:"AUCTION"}`), `vintage` (`{sets: VINTAGE_SETS}`), `modern` (`{modernEra:true}`) | deals | `FilterBar` grid params, category filter fixed |
| `/japanese-cards` | `fetchDealsPool`/`fetchDealsPage` with `language:"japanese"` | deals (japanese) | `FilterBar` grid params — **deals only, no catalogue, no search** |

`FilterBar` (`components/FilterBar.js`) emits query state `?country=&type=raw|graded&listing=FIXED_PRICE|AUCTION&maxPrice=&minPrice=&sort=` on any grid route; each pill is a plain `<a rel="nofollow">` link (canonicalises back to the base route). **This is the only structured-filter grammar the site has today, and it never meets the price-checker.**

### 1c. Identity primitives (reusable, already deterministic)

| Primitive | File | What it does |
|---|---|---|
| `SPECIES` (1,025) + `extractSpecies(name)` + `speciesSlug` + `speciesForSlug` + `ALIASES` + `BY_FIRST_TOKEN` index | `lib/pokemonSpecies.js` / `pokemonSpeciesData.js` | canonical Pokemon vocabulary + name→species extraction (owner prefixes, regional forms, tag-team → first species) |
| `catalogCardSlug(name,set)` / `splitCardSlug(slug,setIndex)` / `pickCatalogMatch(rows,nameSlug)` | `lib/cardSlug.js` | card slug ⇄ identity; tie-break on lowest `tcgplayer_id`, never price |
| `slugifySet(value)` | `lib/slugify.js` | `[^a-z0-9]+ → -` |
| `collectorNumberFromName(name)` / `cardDisplayName(card)` | `lib/cardName.js` | pull `4/102` / `SWSH039` / `(15)` out of a name; strip pure-number parenthetical |
| `queryNumbers(q)` / `cardNumberForms(n)` / `scoreCatalogResult` | `lib/searchRanking.js` | collector-number normalisation + result scoring (page-local) |
| `isSpecialtyCard` / `SPECIALTY_SETS` (`Jumbo Cards`, `World Championship Decks`) | `lib/catalogueView.js` | demote oversized/championship prints |
| `classifyQueryIntent(raw)` → structural flags | `lib/analytics/intent.js` (13A) | **analytics only** — `contains_graded_token`, `grader_token`, `contains_grade_token`, `contains_price_modifier`, `contains_language_modifier`, `contains_collector_number`, `contains_set_candidate`, token count/band. **Does not drive resolution.** Its regexes are a good starting vocabulary for the real parser. |

### 1d. Data model (authoritative columns)

**`card_catalog`** — local, 29,309 rows, RLS-off, indexed `(species,language)` and `(set_id,language)`:
`tcgplayer_id` (PK) · `name` · `set` · `set_id` · `card_number` (27,919 populated) · `rarity` · `card_type` (`Pokémon`/`Trainer`/`Energy`) · `species` (23,243 populated, from `extractSpecies`) · `language` (`english` default) · `market_price` · `image_url`. ~128+ distinct English set names.

**`deals`** — 3,318 active, RLS "active readable":
`watchlist_id` · `marketplace` (`EBAY_US`…`EBAY_IT`) · `listing_type` (`FIXED_PRICE`/`AUCTION`) · `bid_count` · `auction_end_at` · `total_price` · `total_price_usd` · `market_price` · `discount_pct` · `condition` · **`is_graded`** · **`grader`** (`PSA`/`CGC`/`BGS`/`SGC`/`TAG`/`ACE` — active: PSA 140, CGC 22, ACE 3, BGS 2, TAG 1 = **168 graded, ~5%**) · **`grade`** (text `"10"`, `"9.5"`) · `item_location_country` · `is_local` · flat `card_name` / `card_set` / `card_language` / `card_tcgplayer_id` / `card_catalog_id` (feed-discovery trigger fills these; indexes on `(card_language,is_active)`, `card_tcgplayer_id`, `card_set`).

**`watchlist`** — 8,634 rows: `name` · `set` · `justtcg_tcgplayer_id` · `language` · `justtcg_condition`. **No structured `card_number` column** (number lives inside `name`).

**Key structural facts for 13B:**
- Grading = a **deal/listing** fact (`deals.is_graded/grader/grade`). It cannot be a catalogue query. `graded pikachu` = *"Pikachu deals where `is_graded=true`"*.
- Collector-number + set + species + language + rarity are **structured columns on `card_catalog`** — an exact catalogue match is a millisecond Postgres query, not a PPT call.
- `deals` can be filtered by species today only via `card_name`/`extractSpecies` or by joining `card_tcgplayer_id` → `card_catalog.species`.

---

## 2. Current failure modes (full list)

| Mode | Where | Evidence |
|---|---|---|
| **F1 — "graded"/"raw" ignored** | `/api/card-search` never parses it; PPT drops it; no catalogue field to filter | `graded pikachu` total 618 = `pikachu` total 618 |
| **F2 — grade token = number-noise** | PPT + `lib/searchRanking.js` `queryNumbers` both treat `10` / `9.5` as collector numbers | `pikachu psa 10` total 6,015 (10× `pikachu`); `scoreCatalogResult` `+45` to cards #10 |
| **F3 — grader token = nothing** | `psa`/`cgc`/`bgs`/`sgc` are passed as name tokens to PPT, match nothing, then `nameQ.every(...)` in scoring fails to match, pushing real cards *down* | `psa pikachu` behaves like a 2-word name search that can't be satisfied |
| **F4 — exact printing buried** | reranker only reorders the 20 rows PPT returns; if the wanted print isn't on PPT's page 1 it's unreachable | `charizard 4/102` → PPT page 1 = 2 modern reprints; Base Set not present |
| **F5 — duplicated collector numbers across sets** | `queryNumbers` + `cardNumberForms` match `4/102` on *any* set; nothing prefers the era/set the user meant | `4/102` exists in Base Set, Base Set 2, Legendary Collection, Celebrations, ME 30th, … |
| **F6 — price modifiers ignored** | `under $200` / `under 50` are passed to PPT as name tokens; no `price_max` extraction; `/search` has no price filter | `pikachu under 50` = name search for "pikachu under 50" |
| **F7 — language modifier ignored / siloed** | `/api/card-search` is hard-coded English (`findExistingDeals` `.eq("language","english")`, `searchCards` no language param); Japanese lives only at `/japanese-cards` with no search box | `japanese pikachu` returns English results or nothing useful |
| **F8 — listing-type modifier ignored** | `pikachu auction` / `pikachu buy it now` — no `listing_type` extraction; the token pollutes the name query | — |
| **F9 — no Pokemon × graded intersection** | `/pokemon/[slug]` = raw-leaning deal aggregation (no grader/grade in `fetchSpeciesDealsPage` or its FilterBar); `/deals/graded` = graded deals with no species filter; API `cardDetail` has the filters but the UI never calls them at species scope | The Facebook "graded Pikachu drops" request has no landing |
| **F10 — no result-type routing** | every query renders the same "deals found (N)" + "catalogue (N matching, page 1 of X)" layout; an exact-card query gets the same treatment as broad discovery | `charizard 4/102` should land on/hero the exact `/cards/[slug]`; instead it's row 1 of a 13-page grid |
| **F11 — request fan-out / no cancellation** | `SearchClient.loadSearch` has no `AbortController` and no stale-response guard; pause-typing fires multiple sequential 1–2s requests; `changeSearchCountry`/`changeSearchSort` fire immediate extra requests | this is the "5–9s" from 12D (cumulative, not one slow call) |
| **F12 — no deterministic catalogue matching** | every query, however exact, goes out to PPT; `card_catalog` (local, structured, indexed) is only used *after* to resolve hrefs | latency + F4 + F5 all downstream of this |
| **F13 — context lost on navigation** | `/search` → `/cards/[slug]` drops country/graded/grade/price; `/pokemon/[slug]` → `/cards/[slug]` drops the species FilterBar state; nothing carries collector intent forward | user re-specifies "graded / under $200" at every hop |

---

## 3. Canonical intent schema

One deterministic object, produced by the parser (§4), consumed everywhere in 13B. Field names chosen to match existing DB columns / vocab.

```ts
// The single source of truth for "what did the user ask for".
// Produced by parseSearchIntent(rawQuery, context). No LLM. No I/O in the parser itself.
interface SearchIntent {
  // ---- raw + provenance (never sent to analytics) ----
  raw: string;                       // original query, verbatim; used only server-side / for re-parse
  tokens_consumed: string[];         // which raw tokens the parser claimed (for debugging / "did you mean")
  tokens_unmatched: string[];        // leftover tokens → the free-text name query

  // ---- SUBJECT (what card/thing) — at most one is "primary" ----
  subject: {
    kind: "card" | "species" | "set" | "none";
    // card identity, strongest signal first:
    collector_number: string | null; // normalised: "4/102", "sm110", "swsh039" (see cardNumberForms)
    set: string | null;              // canonical card_catalog.set name (resolved, not raw)
    set_id: string | null;           // card_catalog.set_id when resolved
    card_name: string | null;        // free-text name query (unmatched tokens joined), e.g. "charizard"
    species: string | null;          // canonical SPECIES entry, e.g. "Pikachu" / "Umbreon"
    tcgplayer_id: string | null;     // set only when resolution (§5) produced ONE exact card
    card_slug: string | null;        // catalogCardSlug(name,set) when tcgplayer_id known
    species_slug: string | null;     // speciesSlug(species) when species known
  };

  // ---- RESULT MODE (what surface to show) — see §6 for how it's chosen ----
  result_mode: "exact_card" | "catalogue" | "deals" | "listings";
  //   exact_card  → hero/redirect a single /cards/[slug]
  //   catalogue   → a filtered card_catalog browse (identity discovery)
  //   deals       → our verified below-market deals, filtered (marketplace intent)
  //   listings    → (reserved) broader live eBay listings, not just below-market — NOT built in 13B unless a gap forces it
  is_exact: boolean;                 // true when subject resolves to exactly one printing with high confidence

  // ---- COLLECTOR MODIFIERS (constraints on the result set) ----
  format: "any" | "raw" | "graded";  // "graded"/"slabbed" → graded ; "raw"/"ungraded" → raw
  grader: "PSA" | "CGC" | "BGS" | "SGC" | "TAG" | "ACE" | null;   // matches deals.grader vocabulary
  grade: string | null;              // "10", "9.5", "9" … (string, matches deals.grade)
  condition: "NM" | "LP" | "MP" | "HP" | "DMG" | null;            // raw only; maps to deals.condition text
  language: "english" | "japanese" | null;                        // null = caller default (usually english)
  era: "wotc" | "modern" | null;     // "base set/jungle/…/neo/…" → wotc ; "scarlet & violet/…" → modern
  listing_type: "any" | "BIN" | "AUCTION";   // "buy it now"/"bin" → BIN ; "auction"/"bid" → AUCTION
  country: string | null;            // EBAY_XX marketplace filter; default from context, not query
  price_min: number | null;          // USD
  price_max: number | null;          // USD  ("under $200" → price_max: 200)
  minimum_discount: number | null;   // 0..1 fraction; rarely from query, mostly context/default
  sort: "relevance" | "best_discount" | "price_asc" | "price_desc" | "ending_soon" | "newest" | null;

  // ---- confidence / routing hints ----
  confidence: "high" | "medium" | "low";   // drives exact_card redirect vs. hero vs. plain result
  ambiguities: string[];             // e.g. ["collector_number 4/102 exists in 5 sets", "species vs card_name both plausible"]
}
```

**Context object** passed to the parser (from URL/session, see §8):
```ts
interface SearchContext {
  default_language: "english" | "japanese";   // site/user default
  default_country: string | null;             // viewer marketplace (from CurrencyProvider, 13A)
  carried_intent: Partial<SearchIntent> | null; // sticky modifiers from the previous page (§8)
}
```

**Mapping to DB:**

| Intent field | catalogue query (`card_catalog`) | deals query (`deals`) |
|---|---|---|
| `subject.collector_number` | `card_number` (via `cardNumberForms` OR-set) | `card_catalog` join → then `watchlist_id`/`card_tcgplayer_id` |
| `subject.set` / `set_id` | `set` / `set_id` | `card_set` / join |
| `subject.species` | `species` | `card_tcgplayer_id → card_catalog.species` OR `extractSpecies(card_name)` |
| `subject.card_name` | `name ILIKE` / slug match / trigram | `card_name ILIKE` |
| `format` / `grader` / `grade` | — (N/A on catalogue) | `is_graded`, `grader`, `grade` |
| `condition` | — | `condition` |
| `language` | `language` | `card_language` |
| `listing_type` | — | `listing_type` (`BIN` → `FIXED_PRICE`) |
| `country` | — | `marketplace` (+ `is_local` sort) |
| `price_min/max` | `market_price` (reference) | `total_price_usd` |
| `minimum_discount` | — | `discount_pct` |
| `era` | derived set-name match → `set`/`set_id` set | via `card_set` |

Do **not** persist `raw` or `tokens_*` to PostHog. Only the structural flags (§12).

---

## 4. Token grammar / parser precedence

`parseSearchIntent(raw, ctx)` — **pure, deterministic, single left-to-right pass with ordered claim priority.** No fuzzy matching in the parser. Fuzzy (trigram) is a *resolution* fallback only (§5), never a parse step.

### 4.1 Normalisation
- lowercase; collapse whitespace; keep `/` `-` `.` `$` `#`; NFKC.
- Preserve original casing map for the leftover name query (so `Farfetch'd` still resolves).

### 4.2 Claim order (a token consumed by an earlier rule is not re-examined)

1. **Collector-number grammar** (highest — most specific identity signal)
   - `\b(\d{1,4})\s*/\s*(\d{1,4})\b` → slash number `4/102` (normalise leading zeros: `004/130` ≡ `4/130`).
   - `\b([a-z]{1,5}\d{1,4}[a-z]?)\b` where the alpha prefix is a known set-code family (`xy`, `sm`, `swsh`, `sv`, `bw`, `hgss`, `dp`, `pl`, `col`, `bwp`, `xyp`, `smp`, `swshp`, `svp`, `me`, …) → prefixed number `sm110`, `swsh039`.
   - `#\s*([a-z]{0,5}\d{1,4}[a-z]?(?:/\d{1,4})?)` → explicit `#`-prefixed number.
   - **Bare 1–3 digit run** (`10`, `102`) → **collector number ONLY IF** not already claimed as a grade (rule 3) and not part of a price phrase (rule 6). Context rule: a bare number *after* a grader token or the word `grade` is a **grade**, never a collector number (`pikachu psa 10` → grade). A bare number *inside* `n/m` is a collector number (`pikachu 10/102`).
2. **Grader vocabulary** — `psa | cgc | bgs | beckett | sgc | tag | ace` → `grader` (canonical uppercase; `beckett`→`BGS`). Also sets `format = "graded"`.
3. **Grade grammar** — a number `1..10` optionally `.5`, when:
   - immediately follows a grader token (`psa 10`, `bgs 9.5`), or
   - follows the literal word `grade` (`grade 9`), or
   - is `gem mint 10` / `pristine 10` / `black label` phrasing.
   → `grade` (string, keep `.5`). Consuming the number here removes it from rule 1's bare-number pool.
4. **Format words** — `graded | slabbed | slab | encased` → `format="graded"`; `raw | ungraded | loose | unslabbed` → `format="raw"`.
5. **Condition vocabulary** (raw only) — `near mint | nm | mint | m | lightly played | lp | light play | moderately played | mp | heavily played | hp | damaged | dmg | poor | pl` → `condition` enum. (Do not consume `mint` if it's part of `gem mint 10`.)
6. **Price grammar** —
   - `\$?\s*\d+(\.\d+)?` preceded by `under | below | less than | max | up to | cheaper than | <=?` → `price_max`.
   - `… over | above | at least | min | more than | >=?` → `price_min`.
   - `between $X and $Y` / `$X-$Y` → both.
   - bare `$\d+` with no comparator → `price_max` (collectors say "$200" meaning "≤$200") **only if** the number isn't a plausible collector number (has `$` or `.` or ≥4 digits or a comparator nearby).
7. **Listing-type vocabulary** — `auction | auctions | bid | bidding | ending soon` → `listing_type="AUCTION"` (+ `sort="ending_soon"` if "ending soon"); `buy it now | bin | fixed price | fixed | now` (word "now" only when adjacent to "buy it") → `listing_type="BIN"`.
8. **Language vocabulary** — `japanese | japan | jp | jpn` → `language="japanese"`; `english | eng | en` → `language="english"`. (Everything else — german, french… — is out of scope for 13B; flag as `ambiguity` and default to `ctx.default_language`.)
9. **Era / set-name resolution** — match the **longest** run of remaining tokens against the **canonical set-name index** (`SELECT DISTINCT set, set_id FROM card_catalog`, cached; longest-name-first like `fetchCatalogSetIndex`). A hit sets `subject.set` + `subject.set_id`. Independently, map known WOTC-era set names (`base set`, `shadowless`, `jungle`, `fossil`, `team rocket`, `gym heroes/challenge`, `neo *`, `legendary collection`, `expedition`, `aquapolis`, `skyridge`) → `era="wotc"`; modern SV/SWSH families → `era="modern"`. (`lib/gradedConfidence.js` `SHARED_IDENTITY_RE` and `lib/dealCategories.js` `VINTAGE_SETS` are existing partial vocabularies to consolidate — do not fork a third.)
10. **Species resolution** — run the remaining tokens through `extractSpecies` + `BY_FIRST_TOKEN` (the existing `lib/pokemonSpecies.js` index). A hit sets `subject.species`. Do **not** consume the token if it's *also* a plausible card-name token (keep it in `card_name` too — a `/cards/[slug]` name match and a species are not mutually exclusive; resolution §5 decides which wins).
11. **Everything left** → `subject.card_name` (joined, original casing) and `tokens_unmatched`.

### 4.3 The number-disambiguation rule (the crux)

```
bare number N (1–3 digits, no slash, no $):
  if a grader token or the word "grade" was seen before N (within the query)  → grade
  elif N is 10 and "psa|cgc|bgs|sgc" seen anywhere                            → grade   (covers "pikachu 10 psa")
  elif N is part of "n/m"                                                      → collector_number
  elif a price comparator ("under"/"over"/…) precedes N, or N has "$"          → price_max/price_min
  elif N ≥ 4 digits                                                            → collector_number (or year — low value, keep as number)
  else                                                                        → collector_number   (default; matches today's behaviour for "pikachu 25")
```

`pikachu psa 10` → `10` = grade. `pikachu 10/102` → `10/102` = collector_number. `pikachu 25` → `25` = collector_number (unchanged). `psa 10 pikachu under $200` → `10` grade, `200` price_max.

---

## 5. Entity resolution precedence

`resolveSubject(intent, {db})` → mutates `intent.subject` (+ `tcgplayer_id`, `card_slug`, `confidence`, `ambiguities`). **Local `card_catalog` first; PPT only as a last resort and only for identity we don't hold.**

**Precedence (first that yields a confident single row wins):**

1. **set + collector_number** → `card_catalog WHERE language=? AND set_id=<resolved> AND card_number IN (cardNumberForms)`.
   - 1 row → `is_exact=true`, `confidence=high`.
   - >1 row (rare same-set dup, e.g. Unown) → tie-break lowest `tcgplayer_id` (existing `pickCatalogMatch` rule), `confidence=high`.
2. **collector_number + name (no set)** → `card_catalog WHERE language=? AND card_number IN (forms) AND name ILIKE '%<name>%'`.
   - 1 row → exact, `high`.
   - >1 row across sets (the `4/102` case) → **rank by era/set precedence**, keep all as `catalogue` candidates but mark the top one as the `exact_card` hero:
     - explicit `intent.era` match first, else
     - **oldest set** (`set_id` chronological — Base Set before Base Set 2 before Legendary Collection before Celebrations before ME 30th), else
     - lowest `market_price`-independent stable key.
     `confidence=medium`, `ambiguities += "collector_number 4/102 in N sets"`.
   - This is what makes `charizard 4/102` → 1999 Base Set Charizard.
3. **collector_number only** (no resolvable name) → `card_catalog WHERE card_number IN (forms)` grouped by name; if one dominant name → treat as that name + go to rule 2; else `catalogue` mode with the number as a hard filter.
4. **exact card name + set** → `card_catalog WHERE language=? AND set_id=? AND slugifySet(name)=slugifySet(<name>)` (reuse `pickCatalogMatch`). 1 row → exact `high`.
5. **exact card name only** → `card_catalog WHERE language=? AND name ILIKE '<name>'` (exact, case-insensitive). 1 row → exact `high`. >1 (same name, many sets: "Charizard") → `species`/`catalogue` mode, NOT exact.
6. **species** → `intent.subject.species` already canonical from parser. `card_catalog WHERE species=? ` count → if 1 print only, promote to exact; else `species` subject.
7. **fuzzy name** (only if 1–6 all empty and `card_name` present) → Postgres trigram (`pg_trgm` `%` / `similarity`) on `card_catalog.name` OR, if trigram index absent, a bounded `ILIKE '%token%'` per token. This is the *only* fuzzy step and it is a resolution fallback, not a parser step. If still nothing → **one** PPT `searchCards(card_name)` call as the absolute last resort (typo tolerance: "charzard").

**Duplicated collector numbers across sets** (F5): rules 1 (set given) and 2 (era/oldest-set tiebreak) handle it deterministically. Never let `market_price` decide which printing a query resolves to (same rule as `pickCatalogMatch`).

**Prerequisite for 13B.2 (blocker — see §14):** confirm/add a Postgres index that makes name matching fast — either `pg_trgm` GIN on `card_catalog(name)` and `deals(card_name)`, or at minimum `card_catalog(card_number)` and `card_catalog(species, language)` (the latter exists). Without trigram, rule 7 stays `ILIKE` and is acceptable for 13B.2 but should be logged as tech debt.

---

## 6. Exact vs broad result hierarchy

`result_mode` and `is_exact` are decided by `resolveSubject`'s output, then the UI renders one primary surface + optional secondary surfaces.

| Situation after resolution | `result_mode` | `is_exact` | Primary surface | Secondary |
|---|---|---|---|---|
| Exactly one printing, `confidence=high` (rules 1, 4, 5-single, 6-single) | `exact_card` | true | **`/cards/[slug]`** — redirect if query was submitted (Enter/button) and confidence high; **hero card** at top of `/search` if typed/low-confidence | its live deals inline (already on `/cards/[slug]`); "more `<Species>` deals" link |
| One printing chosen from a cross-set collector-number set, `confidence=medium` (rule 2 multi) | `exact_card` | true (soft) | **hero `/cards/[slug]`** for the top pick, NOT a redirect | the other same-number prints as a small "other printings" strip; full `catalogue` list below |
| A grading/price/listing modifier present + a subject (species or card) | `deals` | subject's `is_exact` | **filtered deals list** (`/search` results, or route to `/pokemon/[slug]?…` / `/cards/[slug]?…` / `/deals/…` — §7) | catalogue reference for the same subject below (collapsed) |
| Species only, no modifiers ("pikachu") | `catalogue` | false | **filtered `card_catalog` browse** for that species (identity discovery) — links each print to `/cards/[slug]` | any live deals for the species as a strip; link to `/pokemon/[slug]` if it exists |
| Broad name, many prints, no number ("charizard") | `catalogue` | false | filtered `card_catalog` browse | — |
| Set only ("base set") | `catalogue` (set-scoped) | false | route to **`/sets/[slug]`** if it exists, else set-filtered catalogue | — |
| Nothing resolves | `catalogue` | false | fuzzy catalogue best-effort + "no exact card found" copy (existing) | — |

**Rule of thumb:** *identity* intent → `catalogue`/`exact_card`; *acquisition* intent (any of graded/grade/grader/price/listing_type/`minimum_discount`/`country`, or the words "deal"/"cheap"/"under") → `deals`. When both, `deals` is primary with catalogue as evidence.

Examples:
- `charizard 4/102` → `exact_card`, redirect on submit → `/cards/charizard-base-set`.
- `pikachu` → `catalogue` (species browse).
- `PSA 10 Pikachu under $200` → `deals` (species Pikachu, `is_graded`, `grader=PSA`, `grade=10`, `price_max=200`), sorted `best_discount`.

---

## 7. Catalogue vs listing/deal selection rules

| Intent shape | Query target | Route it should land on / call |
|---|---|---|
| identity only (name/number/set/species, no modifiers) | `card_catalog` | `/search` catalogue list, or redirect to `/cards/[slug]` / `/sets/[slug]` / `/pokemon/[slug]` when exact & the page exists |
| identity + **format/grader/grade** | `deals WHERE is_graded [AND grader] [AND grade]` scoped to subject | if subject = one card → `/cards/[slug]` (its deals already filter via `?tcgplayerId` API) ; if subject = species → **new**: `/pokemon/[slug]` with a graded filter param (§9), backed by a species+graded deals query ; if subject = none → `/deals/graded` (existing) |
| identity + **price / discount / listing_type / country** | `deals` scoped to subject with the corresponding column filters | `/search` deals list (filtered) or the matching `/deals/[category]` when the subject is empty (`auctions`, `under-50`, …) |
| species + graded + grade + price (the F9 gap) | `deals` joined to `card_catalog` on `card_tcgplayer_id` for `species`, filtered `is_graded/grader/grade/total_price_usd`, sorted `discount_pct` | **`/pokemon/[slug]?format=graded&grader=psa&grade=10&max=200`** — see §9. No new crawlable route; query-param state on the existing page. |
| exact card + condition (raw) | `deals WHERE is_graded=false AND condition ~ <NM/…>` | `/cards/[slug]?…` (API already supports `condition`) |
| language = japanese | japanese `deals` + (future) japanese `card_catalog` if synced | `/japanese-cards` (existing) — 13B should at least make the site search *route* a `language:japanese` intent there rather than returning empty English results |

**Catalogue-first, PPT-last (F12):** `resolveSubject` must exhaust `card_catalog` before any PPT call. PPT `searchCards` is retained only for (a) typo fallback in rule 7, (b) the existing paginated "browse everything named X" catalogue list when the user explicitly pages past what `card_catalog` filtering returns. Never call PPT to answer a graded/price/listing query.

**Never fabricate availability or pricing:** deals come from `deals` (verified, `isDisplayableDeal`); reference prices from `card_catalog.market_price` / PPT with the existing sentinel guards. A `deals` filter that returns 0 rows shows "no live deals match" — it never falls back to a live eBay search or an invented price.

---

## 8. Navigation / context preservation rules

Intent has three lifetimes. Nothing is persisted to disk (13A.1 zero-storage posture stands); carry via **URL query params** (primary) and an in-memory `SearchContext.carried_intent` for the SPA session (secondary, never `localStorage`).

| Boundary | Carry forward | Drop | Why |
|---|---|---|---|
| hero search → `/search` | the whole raw query (`?q=`) | — | already happens |
| `/search` → `/cards/[slug]` (exact card click) | `format`, `grader`, `grade`, `condition`, `country`, `listing_type`, `price_*` as query params the card page's deal filter already understands (`?graded=&listingType=&condition=&maxPrice=&country=`) | `species`, `set`, `sort`, `q` | the card page is now the subject; acquisition constraints still matter |
| `/search` → `/pokemon/[slug]` (species click) | `format`/`grader`/`grade`/`price_*`/`listing_type`/`country` as the new species FilterBar params (§9) | `card_name`, `collector_number` | user narrowed to a species but keeps "graded PSA 10 under $200" |
| `/pokemon/[slug]` → `/cards/[slug]` (print click) | same acquisition params | `species` | drilling from species to one print |
| `/cards/[slug]` → `/deals/[id]` (open a listing) | nothing new; `?from=` (existing return-nav hint, product-functional) | all filters | you're looking at one listing |
| any grid `FilterBar` change | that one facet in the URL (existing behaviour) | — | unchanged |
| `country` | **always** carried (it's a viewer property, from `CurrencyProvider`/`RegionControl`), across every boundary | — | already the site-wide model |
| new search from the header on any page | **reset** carried_intent unless the new query itself restates a modifier | — | a fresh "charizard" query shouldn't inherit "graded PSA 10" from 3 pages ago |

**`carried_intent` contents (session-memory only):** `format`, `grader`, `grade`, `price_min`, `price_max`, `listing_type`, `condition`, `country`. **Not** `subject`, `raw`, `sort`. Cleared when the user submits a query that resolves to a different `subject.kind` or explicitly types a contradicting modifier.

---

## 9. URL / query-state contract

**Canonical routes stay exactly as they are.** All structured filter state is **query parameters** on those routes, `robots: noindex` when a param is present (the `/search` wrapper already does `robots: query ? {index:false, follow:true} : undefined` — extend the same rule to the new params on `/pokemon/[slug]` and `/cards/[slug]` filtered states), `follow: true`, **never in `sitemap.xml`**, canonical pointing at the bare route.

| Route | Existing params | 13B adds (all optional, all noindex-when-present) |
|---|---|---|
| `/search` | `q`, `page`, `country`, `sort` | `format` (`raw`/`graded`), `grader`, `grade`, `min`, `max`, `listing` (`bin`/`auction`), `lang` — the parser also derives these from `q`, so the params are the *resolved* form for shareable links |
| `/pokemon/[slug]` | (FilterBar) `country`, `type`, `listing`, `maxPrice`, `minPrice`, `page`, `sort` | `grader`, `grade` (only meaningful with `type=graded`) — **this is the F9 fix**: `/pokemon/pikachu?type=graded&grader=psa&grade=10&maxPrice=200` |
| `/cards/[slug]` | (deal filters via `?tcgplayerId` API) | surface the same as page query params: `?graded=&grader=&grade=&listingType=&condition=&maxPrice=&minDiscount=&country=` |
| `/deals/[category]` | (FilterBar) | unchanged — `graded`/`auctions`/`under-*` categories already exist |

**Param naming:** reuse the FilterBar vocabulary already in the codebase (`type=graded`, `listing=AUCTION`, `maxPrice`, `minPrice`, `country`) rather than inventing `format`/`max`; add only `grader` and `grade`. Consistency > the schema's illustrative names (the brief permits this).

**Hard rule (SEO guardrail, restated):** do **not** mint `/pokemon/<slug>/graded/psa10/under-100` path segments or any `pokemon × set × grader × grade × condition × price` crawlable URL family. `/search` remains the sole canonical search tool. Query-param state only. No sitemap entries. No `generateStaticParams` for filter permutations.

---

## 10. SEO / indexability guardrails

- **No new route families.** The only routes that exist after 13B are the ones that exist now: `/cards/[slug]`, `/pokemon/[slug]`, `/sets/[slug]`, `/deals/[id]`, `/deals/[category]`, `/japanese-cards`, `/search`.
- **Every filtered state is `noindex, follow`** and canonical → bare route. The `tests/seo/*` suite already asserts `/search?q=` is noindex; 13B.2 must extend `pages.test.mjs` to assert the new `?grader=`/`?grade=`/`?format=` states on `/pokemon/[slug]` and `/cards/[slug]` are also `noindex` and self-canonical to the bare route.
- **Sitemaps unchanged.** `lib/sitemap.js` / `app/sitemaps/[segment]` list `/cards`, `/pokemon`, `/sets`, `/deals/[id]` (capped), `/deals/[category]` landing pages — no filter permutations. 13B adds nothing here.
- **Permanent pages keep their value:** `/cards/[slug]` and `/pokemon/[slug]` and `/sets/[slug]` still resolve from `card_catalog` even with no live deal (existing Phase 4/5 behaviour). Search routing to them must not depend on a deal existing.
- **Internal links from search results** to `/cards/[slug]` etc. stay `follow` (equity flows through), exactly as today.

---

## 11. Performance latency map

Measured 2026-09-03 against production.

| Segment | Cost | Notes |
|---|---|---|
| Raw PPT `GET /v2/cards?search=` (limit 20) | **320–630 ms** | `pikachu` 499ms · `graded pikachu` 359ms · `pikachu psa 10` 628ms · `charizard 4/102` 364ms · `base set charizard` 322ms. Consistent, not the main problem. |
| `/api/card-search` total (server, prod) | **1.0–1.9 s** | `pikachu` 1.94s · `graded pikachu` 1.27s · `pikachu psa 10` 1.63s · `charizard 4/102` 1.31s · `base set charizard` 1.10s |
| ⇒ non-PPT server time | **~0.5–1.3 s** | = `watchlist ILIKE '%q%' LIMIT 500` (seq scan, 8,634 rows, **no `pg_trgm`/GIN index**) + `findDealsForCatalogPage` (Supabase, depends on PPT page) + `resolveCatalogHrefs` (Supabase `card_catalog` `IN`) + Vercel function invoke overhead. `dynamic="force-dynamic"` ⇒ **zero caching**, every call cold-ish. |
| Client — debounce | **+350 ms** per query change (`setTimeout` in `SearchClient` effect) |
| Client — **request fan-out (F11)** | **the "5–9 s" from 12D** | `loadSearch` has **no `AbortController`, no stale-response guard, no `lastQuery`-during-flight check**. Pause-typing "pikachu" then " psa 10" fires 2+ sequential un-cancelled 1–2s requests; `changeSearchCountry`/`changeSearchSort` fire immediate extra ones. "Searching…" persists until the *last* resolves; a slow earlier response can overwrite a newer one. |
| Render | negligible (`rerankCatalogResults` is in-memory over 20 rows) |
| eBay | **not touched per query** — deals come from our DB (`deals`), never a live eBay call on search. Good. Keep. |

**13B.2 should attack, in order:**
1. **F11 client fan-out** — add `AbortController` + request-id stale guard + don't fire on `country`/`sort` change until a query exists. *Biggest perceived win, smallest change, zero data risk.*
2. **F12 catalogue-first** — deterministic `card_catalog` resolution for exact queries removes the PPT call entirely for `charizard 4/102`, `base set charizard 4/102`, `pikachu 10/102`, etc. (sub-100ms local query).
3. **`watchlist ILIKE` → indexed** — either `pg_trgm` GIN on `watchlist(name)` + `card_catalog(name)` + `deals(card_name)`, or resolve species/card first and query `deals` by `card_tcgplayer_id`/`card_catalog_id` (indexed) instead of by fuzzy name.
4. **Cache the resolved-intent → results** — `/api/card-search` is `force-dynamic`; a short `unstable_cache`/`revalidate` on the *catalogue* half (identity resolution is stable) is safe; the *deals* half stays fresh (short TTL).

**Do not** do a speculative full rewrite. The map above is the target list for 13B.2.

---

## 12. PostHog measurement compatibility

13A search instrumentation (`app/search/SearchClient.js`, `components/HeroSearch.js`) is **live in production** and already emits, with structural-only properties:

| Event | Fires | Key props (all structural, no raw text) |
|---|---|---|
| `hero_search_focus` | input focus | `source` |
| `search_started` | first ≥2-char input in an interaction | `source` |
| `search_submitted` | explicit Enter/button/autocomplete pick | `source`, `via`, + all `classifyQueryIntent` flags |
| `search_request` | a request is actually sent | `source`, `page`, `country`, `sort`, + intent flags |
| `search_results_shown` | response rendered with ≥1 result | `result_count_band`, `latency_band`, `has_deal_results`, `deal_count_band`, + intent flags |
| `search_no_result` | response rendered with 0 | same shape |
| `search_result_clicked` | result/deal tile opened | `surface` (`catalog`/`deal`), `rank`, `has_deal`, `card_slug` |

Existing `classifyQueryIntent` flags (`lib/analytics/intent.js`): `query_token_count`, `query_length_band`, `contains_graded_token`, `contains_raw_token`, `grader_token` (`psa/bgs/cgc/sgc/ace/other/none`), `contains_grade_token`, `contains_price_modifier`, `contains_language_modifier`, `contains_collector_number`, `contains_set_candidate`.

**Compatibility verdict:** the current events fully cover the 13B search funnel (`started → request → results_shown/no_result → result_clicked`) and the intent-slice breakdowns. **No analytics change is required for 13B.1.**

**If 13B.2 wants sharper measurement** (list only — do not build in 13B.1, and only add if genuinely needed):
- `search_result_mode` prop on `search_results_shown` = `exact_card` / `catalogue` / `deals` — to measure how often we produce an exact destination.
- `search_exact_redirect` event — fired when a submit resolves to `is_exact` high-confidence and we redirect to `/cards/[slug]` (measures "we nailed it, no results page needed").
- `search_resolution_source` prop = `catalog_exact` / `catalog_number` / `catalog_fuzzy` / `ppt_fallback` — to see how often PPT is still hit.
- add `contains_condition_token` and `contains_listing_type_token` to `classifyQueryIntent` (both are trivial regex additions, both are 13B parse targets, both are structural).

All of the above are structural. **Never** add raw query text, card names derived from the query, or price values.

---

## 13. Test-query interpretation matrix

`subject` = resolved primary; `mods` = parsed modifiers; `mode` = `result_mode`; `exact` = `is_exact`; `dest` = expected primary destination/surface.

| # | Query | subject | mods | mode | exact | dest (expected) | current behaviour | gap |
|---|---|---|---|---|---|---|---|---|
| 1 | `pikachu` | species=Pikachu | — | catalogue | no | Pikachu catalogue browse (all prints → `/cards/[slug]`); deals strip; link to `/pokemon/pikachu` | 618 PPT catalogue rows, page 1 of 31, obscure language-variant Pikachus on top | no species-scoped catalogue; no deal strip; PPT relevance ordering |
| 2 | `graded pikachu` | species=Pikachu | format=graded | deals | no | Pikachu graded deals (`is_graded=true`), sorted best_discount → ideally `/pokemon/pikachu?type=graded` | 618 catalogue rows, "graded" ignored (total = `pikachu`) | **F1** — no graded routing, no species×graded path |
| 3 | `psa pikachu` | species=Pikachu | grader=PSA, format=graded | deals | no | Pikachu PSA deals | 2-word name search "psa pikachu" against PPT → poor | **F3** |
| 4 | `psa 10 pikachu` | species=Pikachu | grader=PSA, grade=10, format=graded | deals | no | Pikachu PSA 10 deals | `10` treated as number, ~6k results | **F2 + F3** |
| 5 | `pikachu psa 10` | species=Pikachu | grader=PSA, grade=10, format=graded | deals | no | Pikachu PSA 10 deals | 6,015 results (10 = collector-number noise) | **F2** (the marquee failure) |
| 6 | `psa 10 pikachu under $200` | species=Pikachu | grader=PSA, grade=10, format=graded, price_max=200 | deals | no | Pikachu PSA 10 deals ≤ $200 USD, best_discount | `10` + `200` both number-noise; no price filter on `/search` | **F2 + F6** |
| 7 | `pikachu under 50` | species=Pikachu | price_max=50 | deals | no | Pikachu deals ≤ $50 (any format) | name search "pikachu under 50" | **F6** |
| 8 | `raw pikachu` | species=Pikachu | format=raw | deals (or catalogue) | no | Pikachu raw deals (`is_graded=false`); if none, raw catalogue | "raw" ignored | **F1** |
| 9 | `raw pikachu nm` | species=Pikachu | format=raw, condition=NM | deals | no | Pikachu raw NM deals (`is_graded=false AND condition ~ 'near mint'`) | "raw"/"nm" ignored | **F1** + no condition parse (need `contains_condition_token`) |
| 10 | `japanese pikachu` | species=Pikachu | language=japanese | deals/catalogue (japanese) | no | route to `/japanese-cards` scoped to Pikachu, or japanese Pikachu deals | English-only pipeline → English results / nothing | **F7** |
| 11 | `pikachu auction` | species=Pikachu | listing_type=AUCTION, sort=ending_soon | deals | no | Pikachu auctions, ending soonest | "auction" is a name token | **F8** |
| 12 | `pikachu buy it now` | species=Pikachu | listing_type=BIN | deals | no | Pikachu BIN deals | "buy it now" name tokens | **F8** |
| 13 | `base set charizard` | card_name=charizard, set=Base Set (era=wotc) | — | catalogue → exact-ish | soft | `card_catalog` Base Set Charizard prints (holo #4/102 top); redirect if 1 dominant | PPT total 4, count 4 — **actually works today** | minor: no exact redirect, no era tiebreak formalised |
| 14 | `charizard 4/102` | card=Charizard #4/102, cross-set | collector_number=4/102 | exact_card | yes (soft) | **redirect → `/cards/charizard-base-set`** (oldest set with 4/102); other #4/102 prints as strip | PPT page 1 = Celebrations + ME 30th reprints; Base Set not shown | **F4 + F5** |
| 15 | `base set charizard 4/102` | card=Charizard, set=Base Set, number=4/102 | collector_number=4/102, era=wotc | exact_card | yes (high) | **redirect → `/cards/charizard-base-set`** | same as #14 (set token doesn't rescue it) | **F4** |
| 16 | `umbreon japanese` | species=Umbreon | language=japanese | catalogue/deals (japanese) | no | `/japanese-cards` scoped to Umbreon, or japanese Umbreon catalogue | English pipeline | **F7** |
| 17 | `umbreon psa 10` | species=Umbreon | grader=PSA, grade=10, format=graded | deals | no | Umbreon PSA 10 deals → `/pokemon/umbreon?type=graded&grader=psa&grade=10` | `10` number-noise; no path | **F2 + F9** |
| 18 | `charizard psa 9 under $500` | species=Charizard | grader=PSA, grade=9, format=graded, price_max=500 | deals | no | Charizard PSA 9 deals ≤ $500 USD | `9` + `500` number-noise; no price/grade parse | **F2 + F6** |

### Additional edge cases discovered (must be in 13B.2's parser test table)

| Query | Expected interpretation | Trap |
|---|---|---|
| `pikachu 10/102` | collector_number=10/102 (NOT grade 10) | bare-`10` disambiguation must see the slash |
| `pikachu 10 psa` | grader=PSA, grade=10 (grader *after* the number) | grade rule must look both directions for a grader |
| `psa10 pikachu` | grader=PSA, grade=10 (no space) | tokenizer must split `psa10` |
| `pikachu gem mint 10` | grade=10, format=graded, grader=null | "gem mint 10" phrasing; don't consume "mint" as condition |
| `charizard base set 2` | set="Base Set 2" (NOT "Base Set") | longest-set-name-first match |
| `pikachu 25` | collector_number=25 (unchanged from today) | don't regress bare-number = collector number when no grader/price context |
| `charizard ex` | card_name="charizard ex" (species=Charizard, name keeps "ex") | "ex/gx/vmax/v/vstar" are name tokens, never modifiers |
| `moonbreon` | fuzzy → "Umbreon VMAX (Alt Art) / Evolving Skies 215/203" | nickname; rule 7 fuzzy + a small alias map (extend `lib/pokemonSpecies.js` `ALIASES` or a new card-nickname map) |
| `first edition charizard` / `1st edition base set charizard` | era=wotc, name=charizard, note "1st edition" | `1st edition` is a *printing variant* not tracked as a distinct `card_catalog` row (see `pickMarketPrice` note) — parse it into an `ambiguity`/hint, do not promise a 1st-ed-only result |
| `charizard vmax alt art` | card_name="charizard vmax alt art" | "alt art" / "full art" / "secret" are name tokens |
| `pikachu $200` | price_max=200 (bare `$` = ceiling) | `$` present → price, not collector number |
| `pikachu under $50 auction graded psa 9` | species=Pikachu, price_max=50, listing_type=AUCTION, format=graded, grader=PSA, grade=9 | full modifier stack — parser must claim all 6 and leave "pikachu" as name |
| `` (empty) / `p` (1 char) | reject (existing `q.length < 2` guard) | unchanged |
| `charizard 4/102 psa 10` | card #4/102 + grader=PSA grade=10 → `exact_card` mode BUT `deals` filter applied → `/cards/charizard-base-set?graded=true&grader=psa&grade=10` | exact card AND acquisition modifiers coexist (§6 medium row) |

---

## 14. Proposed implementation boundaries for 13B.2–13B.6

Each sub-phase is independently shippable and testable.

### 13B.2 — Parser + fast client (no UI redesign)
- **New:** `lib/searchIntent.js` — `parseSearchIntent(raw, ctx)` → `SearchIntent` (§3, §4). Pure, dependency-free (importable by `node --test`). Consolidates the set-name vocab (`card_catalog` distinct sets, cached), reuses `lib/pokemonSpecies.js`, `lib/cardName.js`, `lib/searchRanking.js` number helpers, and `lib/gradedConfidence.js` WOTC regex. **Deterministic only.**
- **New tests:** `tests/scanner/search-intent.test.mjs` — the full §13 matrix + edge cases as an assertion table.
- **Edit `app/search/SearchClient.js`:** add `AbortController` + request-id stale-guard to `loadSearch`; don't auto-fire on `country`/`sort` before a query exists. (F11 — the perceived-latency win.) No visual change.
- **Edit `lib/analytics/intent.js`:** add `contains_condition_token`, `contains_listing_type_token` (structural, trivial). Update `analytics-intent.test.mjs`.
- **No** resolution change yet — parser output is computed and (optionally) logged; `/api/card-search` still calls PPT. Ship the parser + its tests + the client fix first.

### 13B.3 — Deterministic identity resolution (catalogue-first)
- **New:** `lib/searchResolve.js` — `resolveSubject(intent, {db})` (§5). `card_catalog` queries by `set_id + card_number`, `card_number + name`, `species`, exact name. Era/oldest-set tiebreak for cross-set collector numbers.
- **Edit `app/api/card-search/route.js`:** call `parseSearchIntent` → `resolveSubject`; when `is_exact` high-confidence, return an `exact` block ( `{ card_slug, tcgplayer_id, name, set, confidence }` ) alongside `catalog`. Only fall back to PPT `searchCards` when resolution is empty/low-confidence (rule 7) — removes the PPT call for exact queries (F4, F12, latency #2).
- **Blocker check (do before starting):** verify Postgres indexes — `card_catalog(card_number)`, `card_catalog(species,language)` (exists), and ideally `pg_trgm` GIN on `card_catalog(name)`, `watchlist(name)`, `deals(card_name)`. If trigram isn't available, rule 7 stays `ILIKE` (acceptable, log as debt). **This is the one thing that could block 13B.3 — see §14 note.**
- **Tests:** `tests/scanner/search-resolve.test.mjs` with fixture rows; `tests/seo/` unchanged.

### 13B.4 — Result-mode routing + `/search` UI
- **Edit `app/search/SearchClient.js` + `app/search/page.js`:** render per `result_mode` (§6) — an "exact card" hero (or a client-side redirect on explicit submit + high confidence), a species/set catalogue browse, or a filtered deals list. Add the missing filter controls (`format`, `grader`, `grade`, `price`, `listing_type`, `condition`, `language`) — populated from the parsed intent, editable.
- **URL contract (§9):** reflect resolved intent as `?format=&grader=&grade=&min=&max=&listing=&lang=` on `/search`; `noindex` when present; extend `tests/seo/pages.test.mjs`.
- **Deals half of the query:** filter `deals` by subject (species via `card_tcgplayer_id`→`card_catalog.species`, or exact card via `watchlist_id`/`card_tcgplayer_id`) + `is_graded/grader/grade/condition/listing_type/total_price_usd/marketplace`. Reuse `isDisplayableDeal`, `dealTotalUsd`, existing sort helpers. **No ranking change** — sort options only.

### 13B.5 — Pokemon × graded intersection (the F9 fix)
- **Edit `lib/deals.js` `fetchSpeciesDealsPage`:** accept `grader`, `grade` (only applied with `cardType==="graded"`); filter `deals.grader`/`deals.grade`.
- **Edit `app/pokemon/[slug]/page.js` + its `FilterBar`:** accept/emit `?grader=&grade=` params (only shown when `type=graded`); `noindex` when present; canonical → bare `/pokemon/[slug]`.
- **Context preservation (§8):** `/search` species result + graded modifiers → link to `/pokemon/pikachu?type=graded&grader=psa&grade=10&maxPrice=200`. `/pokemon/[slug]` → `/cards/[slug]` carries the acquisition params.
- **No new route.** Query-param state on the existing indexable page only.

### 13B.6 — Navigation context + language routing + closeout
- **New:** a tiny session-memory `carried_intent` helper (in-memory module state, **no storage** — 13A.1 posture) + the per-boundary carry/drop rules (§8) wired into the result links.
- **Language:** route a `language:japanese` intent from site search to `/japanese-cards` (scoped to the parsed species/name where possible) instead of returning empty English results (F7). Full japanese `card_catalog` sync is out of scope unless a data gap forces it — flag if so.
- **Measurement (§12):** if 13B.4 added `search_result_mode` / `search_resolution_source`, confirm they populate in PostHog EU; no other analytics change.
- **Docs:** update `IMPLEMENTATION_STATUS.md`; short closeout report (matrix pass rate, latency before/after, PPT-call reduction %).

**Cross-cutting constraints (all sub-phases):** no homepage change, no deal-ranking change, no opaque Deal Score, no AI parsing, no new crawlable route family, no sitemap change, no affiliate-URL/param change, no weakening of `isDisplayableDeal` / deal verification, no PostHog raw query text.

---

## 15. FINAL REPORT (Phase 13B.1)

### Files changed
- **`docs/phase-13b1-findability-architecture.md`** — new (this document). No code changed. No tests added (13B.1 is audit/architecture; diagnostic probes were run inline and discarded).

### Architecture discovered
- Two **disconnected** discovery subsystems: (a) `/search` → `/api/card-search` (raw string → **external PPT `searchCards`** + `watchlist ILIKE` for deals + post-hoc `rerankCatalogResults`), and (b) route resolvers in `lib/deals.js` (`/cards`, `/pokemon`, `/sets`, `/deals/[category]`, `/japanese-cards`) each with its own `FilterBar` query grammar. **No shared intent model, no parser.**
- **`card_catalog`** is a local, structured, indexed 29,309-row table (`species` 23,243 · `card_number` 27,919 · `set`/`set_id`/`rarity`/`language`) that the current search **only uses to resolve hrefs after the fact** — never for matching.
- **Grading is a deal attribute** (`deals.is_graded/grader/grade`, 168 active graded, PSA-dominant), not a catalogue attribute. The `?tcgplayerId=` branch of `/api/card-search` already supports per-card `graded`/`listingType`/`condition`/`price` deal filters — unused by the UI.
- Reusable deterministic primitives already exist: `SPECIES`+`extractSpecies` (1,025), `catalogCardSlug`/`splitCardSlug`/`pickCatalogMatch`, `collectorNumberFromName`, `queryNumbers`/`cardNumberForms`, `isSpecialtyCard`, plus 13A's `classifyQueryIntent` regex vocabulary.

### Exact root causes of the current P0 search failures
1. **`graded` ignored** — raw query → PPT, which drops the token (`graded pikachu` total 618 = `pikachu` 618); no code parses it; nothing to filter on in `card_catalog`. Graded intent must become a **deals `is_graded=true`** query, not a catalogue search. (F1)
2. **`psa 10` → thousands** — PPT matches bare `10` as a collector number (`pikachu psa 10` total 6,015 vs `pikachu` 618), and **our own `lib/searchRanking.js` rewards cards numbered 10** (`queryNumbers` + `+45`). `PSA`/`10` are never recognised as grader+grade. (F2, F3)
3. **`charizard 4/102` buries Base Set** — PPT's page-1 for that query is two modern reprints; Base Set Charizard is in the 241-total but not returned, and `rerankCatalogResults` can only reorder the returned page. Must resolve `name + collector_number` against **local `card_catalog`** with an era/oldest-set tiebreak for numbers shared across sets. (F4, F5)
4. **No Pokemon × graded × grade × price path** — `/pokemon/[slug]` is raw-leaning deal aggregation (no grader/grade in `fetchSpeciesDealsPage`), `/deals/graded` has no species filter, and the intersection query is never made. (F9)
5. **Latency is fan-out, not one slow call** — raw PPT call is 320–630 ms; `/api/card-search` server total is 1.0–1.9 s (uncached `force-dynamic` + un-indexed `watchlist ILIKE '%q%' LIMIT 500` + two dependent Supabase queries); the client `loadSearch` has **no `AbortController` and no stale-response guard**, so pause-typing and `country`/`sort` changes stack multiple sequential 1–2 s requests → the "5–9 s" from 12D. (F11, F12)

### Canonical intent contract
`SearchIntent` (§3) — one deterministic object: `subject{kind, collector_number, set, set_id, card_name, species, tcgplayer_id, card_slug, species_slug}`, `result_mode ∈ {exact_card, catalogue, deals, listings}`, `is_exact`, and collector modifiers `format/grader/grade/condition/language/era/listing_type/country/price_min/price_max/minimum_discount/sort` — each mapped to a concrete `card_catalog` or `deals` column (§3 table). Parser precedence and the bare-number disambiguation rule in §4; resolution precedence (set+number → name+number → exact name+set → exact name → species → fuzzy → PPT-last) in §5.

### Query interpretation matrix
§13 — all 18 required queries + 15 discovered edge cases, each with resolved subject, parsed modifiers, expected result mode, exact-vs-broad, expected destination, current behaviour, and the mapped failure mode.

### Latency findings
§11. Priority order for 13B.2: (1) client `AbortController` + stale guard (biggest perceived win, zero data risk), (2) catalogue-first deterministic resolution (eliminates PPT for exact queries), (3) index `watchlist`/`card_catalog` name columns or resolve-then-query-by-id, (4) short cache on the identity half of `/api/card-search`. eBay is not touched per-query — keep it that way.

### Anything that would block 13B.2
- **Nothing blocks 13B.2** (parser + client fix + analytics flags) — all pure/deterministic against data that exists.
- **13B.3 has one prerequisite:** confirm Postgres index support for fast name matching. `card_catalog(species,language)` exists; need to verify/add `card_catalog(card_number)` and (ideally) `pg_trgm` GIN on `card_catalog(name)`, `watchlist(name)`, `deals(card_name)`. If `pg_trgm` is unavailable on the plan, fuzzy fallback stays `ILIKE` (acceptable, logged as debt) — **still not a hard blocker**, just a performance ceiling.
- **13B.5** assumes `deals.card_tcgplayer_id` / `card_catalog_id` are populated for graded deals — the feed-discovery trigger backfills these, but 13B.5 should spot-check coverage on the 168 graded rows before relying on the species join (fallback: `extractSpecies(deals.card_name)`).
- **Japanese (F7/13B.6):** `card_catalog` is English-only synced; a full japanese catalogue sync is out of scope. If japanese *catalogue* discovery (not just deals) is required, that's a separate data task — flag at 13B.6.

### Tests run / results
- No test files added or changed (audit phase). Existing suite unaffected.
- Diagnostic probes executed inline (and discarded): raw PPT `searchCards` timing × 6 queries; production `/api/card-search` timing × 5; Supabase row/column counts (`card_catalog` 29,309 / species 23,243 / card_number 27,919; `deals` 3,318 active / 168 graded by grader; `watchlist` 8,634; 128+ distinct English sets); source-read of `card-search/route.js`, `searchRanking.js`, `cardSlug.js`, `cardName.js`, `pokemonSpecies.js`, `catalogueView.js`, `dealCategories.js`, `deals_schema.sql`, `card_catalog_migration.sql`, `deals_feed_discovery_migration.sql`, `search/page.js`, `SearchClient.js`, `japanese-cards/page.js`.
- Recommended for 13B.2: `npm run test:scanner` + `npm run test:seo` + `npm run build` after each sub-phase, plus the new `search-intent` / `search-resolve` assertion tables.

**STOP. 13B.1 complete. Do not implement 13B.2. Do not start 13C.**
