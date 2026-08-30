# Scanning & deal-detection architecture

_Last reviewed: 2026-08-30. This describes what the code **actually does**,
cross-referenced against the files named in each section — not the
intended design._

The system has **three independent data planes**, each with its own cron,
its own source, and its own table:

| Plane | Source | Table | What it's for |
| --- | --- | --- | --- |
| **Deal scan (cards)** | our eBay Browse API scan | `deals` | live below-market card listings |
| **Deal scan (sealed)** | our eBay Browse API scan | `sealed_deals` | live below-market sealed listings |
| **Reference catalogue** | PokemonPriceTracker (PPT) | `card_catalog`, `sealed_catalog` | every card / sealed product + a market price, for browse pages |

A fourth job, `refresh-catalog`, is pure DB→DB: it rolls the `deals`
table up into `catalog_snapshot` every 15 min so the browse pages read
one JSON row instead of scanning ~8k deal rows per cold render.

---

## 1. Card deal scanning

### 1a. What gets scanned — the `watchlist` table

Card deal scanning **only ever looks at rows in `watchlist`**, never
`card_catalog`. `watchlist` is populated by **`/api/sync-watchlist`**
(`0 3 * * *`), which crawls PPT's whole catalogue (219 sets via
`listSetCards`, or the printings CSV with `?useExport=true`) and upserts
one row per card **whose PPT Near-Mint price ≥ `EXTENDED_MIN_VALUE_USD`
($15)**. Tiering (`classifyTier` in `sync-watchlist/route.js`):

- `PRIORITY_MIN_VALUE_USD = Infinity` → nothing auto-lands in `priority`;
  it's reserved for ~26 hand-picked rows (`source: "manual"`, from
  `scripts/seedWatchlist.js`).
- `≥ $15` → `extended` (`source: "auto"`). ~8,375 rows.
- `< $15`, or a PPT repdigit sentinel (999/9999/…) → **not added.**

`retireStaleAutoRows` deactivates `auto` rows no longer seen in a full
crawl. `last_known_price` on each row = the PPT NM price at last sync;
the scanner uses it as a stability reference (see 1c).

**Coverage boundary:** every card in `card_catalog` priced **≥ $15** and
non-sentinel is eligible. Cards under $15, and the ~8k `card_catalog`
rows that are sub-$15 / unpriced, are **never scanned for deals** — they
appear on browse pages with a PPT reference price only.

### 1b. What triggers a scan

| Cron | Route | Cadence | Job |
| --- | --- | --- | --- |
| `*/15 * * * *` | `refresh-deals?mode=sweep&country=EBAY_US&pages=5` | every 15 min | **sweep** — US new-listing discovery |
| `5,20,35,50 */2 * * *` | `refresh-deals?mode=sweep&country=EBAY_{GB,AU,CA,DE}&pages=8` | every 2 h | sweep — other 4 countries |
| `0 */6 * * *` | `refresh-deals?tier=priority` | every 6 h | per-card scan of the ~26 priority rows, all 5 countries |
| `0 4 <dom> * *` | `refresh-deals?tier=extended&country=…&chunk=1..6` | 1 country-chunk/day | per-card scan of 1/6 of the extended tier in 1 country — full rotation ≈ 30 days |

- **Sweep** (`runSweep`): pulls the newest ~1,000–1,600 listings across
  the *whole* Pokémon-singles category (`searchNewlyListed`, `pages` ×
  200), builds an inverted token index of every active `watchlist` row,
  and matches each listing client-side. Cheap (a handful of requests
  covers thousands of per-card searches). **Never expires anything** — it
  only ever sees a recent slice.
- **Per-card scan** (`scanCardInMarketplace`): one `searchListings` query
  (`"<name> <set>"`, price-floored at `lowestKnownPrice ×
  SANITY_FLOOR_PCT`) per card per country. Confirms + **expires** stale
  deals (grace window: 2 days US, 5 days elsewhere; only reconciles when
  the scan returned a real result set).

Both paths are gated by a **pre-flight Browse-API quota guard** in
`GET()` (`getBrowseRateLimit`, tier-aware floors: sweep 250 / priority
600 / extended 1500) — see `docs/ebay-rate-limits.md`. The app is on
eBay's default **5,000 Browse calls/day** tier.

### 1c. How a listing becomes a card "deal" — the pipeline, in order

For every listing in the search/sweep result (`scanCardInMarketplace` and
`runSweep` run the **identical** sequence — no path skips a step):

1. **`isTrustworthyListing(listing)`** (`lib/dealMatching.js`) — reject if:
   - title matches `EXCLUDED_TITLE_PATTERN` (lot/bundle/proxy/custom/
     repack/digital/code/acrylic/sketch/coa, "choose your", "pick your",
     fan art, display case, trading service, `pokemon go`, account trade)
   - `listingType === "AUCTION" && bidCount >= 1` (a contested bid isn't
     a settled price) — a 0-bid auction passes
   - `sellerFeedbackScore < 10` or `sellerFeedbackPct < 95`
2. **`listingMatchesCard(listing, row)`** — reject unless:
   - every core token of the card **name** (minus `MATCH_STOPWORDS`) is a
     whole-word match in the title (or `token`+digits, e.g. `xy` in
     `XY83`) — **substring matching is deliberately not used** (the
     "go" in "dra**go**nite" bug)
   - if the name carries a trailing `(N)`, the title cites that collector
     number
   - premium-variant rows (Full Art / Alt Art / Trainer Gallery / SIR /
     Rainbow) require the title to say so, unless the number already
     pinned it
   - every core token of the **set** name matches the title
   - language guard both directions (a `japanese` row needs "Japanese" in
     the title; an `english` row must **not** match a title saying
     "Japanese")
3. **Price selection** — `detectListingCondition(title)` →
   `selectConditionPrice(byCondition, tier, fallbackPrice)`. A
   *detected* worse-than-NM signal only ever gets a same-or-worse tier's
   real price, never `fallbackPrice`; if none exists the listing is
   **skipped**. Default (no signal) uses `fallbackPrice`.
4. **`resolveRawCondition`** — if the seller stated no condition **and**
   (apparent discount ≥ `SUSPICIOUS_RAW_DISCOUNT_PCT` (45%) OR price ≤ LP
   × 1.1), spend one `getRawCardCondition` (eBay `getItem`) call to read
   the structured "Card Condition" descriptor. Budget-capped
   (`RAW_CONDITION_LOOKUP_PER_CARD = 2` / `_SWEEP = 8`); if the budget is
   spent, the listing is **held** (not published), not guessed.
5. **`discountPct >= discountThreshold`** (`DISCOUNT_THRESHOLD = 0.1`).
6. **`totalUsd >= marketPrice × SANITY_FLOOR_PCT`** (0.25) — anything
   cheaper than 25% of market is scam-tier, not a deal.
7. Upsert into `deals` (`onConflict: source,marketplace,listing_id`).

**Graded listings:** only the single cheapest graded listing per card
gets the extra `getGradingDetails` + `getGradedPrice` (PPT) lookup (cap
`GRADED_LOOKUP_CAP = 6`/sweep), then steps 5–7 against the graded price.

**Reference-price distrust guard** (`scanOneCard` /
`cachedConditionPrices`): when PPT returns only a single aggregate price
(no per-condition breakdown) **and** it diverges > 40% from
`last_known_price`, the card is skipped that cycle — this is where graded
comps / wrong-printing prices leak in.

---

## 2. Sealed product deal scanning

### 2a. What gets scanned — the `sealed_watchlist` table

Sealed deal scanning **only ever looks at `sealed_watchlist`** — **48
active rows**, all hand-picked. There is **no auto-sync job** for it: it
is populated solely by `scripts/seedSealedWatchlist.js`, a hardcoded
~59-item STARTER list (mostly modern Booster Boxes + Elite Trainer Boxes,
Base Set through the newest sets). `sealed_schema.sql` even names the
missing piece: `source … | 'auto' (future catalog sync)` — never built.

**This is the big coverage asymmetry** (see §5): `sealed_catalog` has
**2,329 products across 151 sets**; scanning covers **48 products across
~17 sets** (whichever of the 48 currently has a live deal).

### 2b. What triggers a scan

One cron: **`/api/refresh-sealed-deals`** at `0 6 * * *` (daily). Scans
every active `sealed_watchlist` row × all 5 marketplaces (`CONCURRENCY =
5`). Same pre-flight Browse quota guard (floor 250). Isolated from the
card scan's cron budget by scheduling, not by a separate eBay quota — it
shares the same 5,000/day Browse ceiling.

### 2c. How a listing becomes a sealed "deal" — the pipeline

`scanProductInMarketplace` — one `searchListings("<name> <set>",
categoryId: null)` per product per country (unscoped: sealed lives in a
different eBay category whose id isn't verified, so the text query +
match check do the filtering). For every listing (no bypass):

1. **`getSealedPrice(tcgplayer_id)`** (once per product, cached) —
   `unopenedPrice` from PPT; **null if absent OR a repdigit sentinel**
   (999/9999/…). No price → product skipped entirely this run.
2. **`isTrustworthySealedListing(listing)`** — reject if:
   - `SEALED_EXCLUDED_TITLE_PATTERN` (opened/empty/resealed/repack/proxy/
     custom/digital/"no product"/"missing packs"/"single pack"/"loose
     packs"/"box only"/…, "code only", "choose your", "pick your",
     trading service, account trade)
   - `GRADED_CARD_PATTERN` — `\b(psa|cgc|bgs|sgc|ace|tag)\s*-?\s*\d` (a
     numeric grade is only ever on a single card, never sealed product)
   - **`listingType === "AUCTION" && bidCount >= 1`** — _added 2026-08-30
     in this review; it was on the card path but not the sealed one_
   - `sellerFeedbackScore < 10` / `sellerFeedbackPct < 95`
3. **`listingMatchesSealedProduct(listing, row)`** — same `coreTokens` +
   whole-word `tokenMatchesTitle` logic as cards: every name token AND
   every set token must be whole-word-present; any title saying
   "Japanese" is rejected. No card-number / condition / variant sub-checks
   (sealed has none).
4. **`discountPct >= DISCOUNT_THRESHOLD`** (0.1, defined locally in the
   route with the same value as cards).
5. **`totalUsd >= marketPrice × SANITY_FLOOR_PCT`** (0.25).
6. Upsert into `sealed_deals`.

Expiry: same grace-window reconcile as cards (2 d US / 5 d others), only
on a trustworthy view.

---

## 3. Reference / market pricing pipeline

**PokemonPriceTracker is the sole source** for `market_price` on both
`card_catalog` and `sealed_catalog`. There is **no in-house eBay
sold-price computation** — `lib/ebay.js` is Browse API only (active
listings). PPT's own numbers are eBay-sold-derived; the site relays them.
(Full write-up of why an in-house version isn't feasible:
`IMPLEMENTATION_STATUS.md` → "can the site price the 13 uncovered vintage
sets itself".)

### 3a. `card_catalog` — `/api/sync-card-catalog` (`0 2 * * *`)

- Downloads PPT's **printings export** (one gzip CSV, 0 API credits, cap
  **2 downloads/day**), merges per-`tcgPlayerId`, upserts ~29 k English
  rows. `species = extractSpecies(name)`; `image_url` derived as
  `tcgplayer-cdn.tcgplayer.com/product/<id>_in_200x200.jpg`.
- `market_price = firstPrice(marketNearMint, marketPrice, LP, MP, HP,
  Damaged)` — first value that is finite, `> 0`, **and not a repdigit
  sentinel** (_the sentinel filter was added in this review; it was
  already in `sync-watchlist`'s `classifyTier` and every `/cards` price
  lookup, but missing here_). `0` / `""` → null (the earlier `$0.00`
  fix).
- Staleness: no explicit TTL — the daily cron overwrites. The full
  backfill is currently incomplete (~21 k of ~29 k rows) pending the
  export quota — see `IMPLEMENTATION_STATUS.md` "A4 coverage spot-check".

### 3b. `sealed_catalog` — `/api/sync-sealed-catalog` (`0 5 * * *`)

- No bulk sealed export usable within the shared 2/day cap, so it walks
  every set via `listSealedProductsForSet(setName)` (`?setName=`,
  `limit=40`, `fetchPPTPaced` backoff for the per-minute 429). ~219
  requests, ~2.3 k credits.
- `sealedCatalogRecord`: `product_type` derived from the name
  (`sealedProductType`), `market_price = unopenedPrice` when finite,
  `> 0`, **and not a sentinel**.
- **`flagImplausibleSealedPrices(records)`** (run in both the route and
  `scripts/syncSealedCatalog.js`): nulls a **Booster Box** priced ≤ its
  set's most expensive **Booster Pack** (a box holds ~36 packs) or < $40
  absolute. Caught the "Base Set booster box ~$500" bug.
- `scripts/syncSealedCatalog.js` additionally HEAD-checks every image URL
  and nulls the ~2 % that 403/404.
- The Vercel route is best-effort within `maxDuration = 800`; the script
  is the reliable full path.

### 3c. On-render price handling

`SpeciesCard`, `CardPriceSummary`, `VariantPriceGrid` all gate every
price through **`hasPrice(n)`** (`lib/money.js`: finite `&& > 0`) → show
"Price unavailable" / "—" rather than a formatted `$0.00`. This is the
last line of defence and covers **both** product types uniformly.

---

## 4. Trust / sanity checks — where each runs, and what it covers

| Check | Card deal scan | Sealed deal scan | `card_catalog` sync | `sealed_catalog` sync |
| --- | :---: | :---: | :---: | :---: |
| Junk-title exclusion | ✅ `EXCLUDED_TITLE_PATTERN` | ✅ `SEALED_EXCLUDED_…` + `GRADED_CARD_PATTERN` | — | — |
| Seller feedback floor (≥95 % / ≥10) | ✅ | ✅ | — | — |
| Contested-auction reject (`bids ≥ 1`) | ✅ | ✅ _(added 2026-08-30)_ | — | — |
| Name + set whole-word match | ✅ `listingMatchesCard` | ✅ `listingMatchesSealedProduct` | — | — |
| Collector-number / premium-variant disambiguation | ✅ | n/a (no numbers) | — | — |
| Japanese-print guard | ✅ both directions | ✅ reject "Japanese" | — | — |
| Per-listing condition detection + safe pricing | ✅ `detectListingCondition` / `selectConditionPrice` | n/a (sealed has no condition) | — | — |
| "Too good to be true" deep-verify (`getItem`) | ✅ `resolveRawCondition` + graded lookup | ❌ none | — | — |
| `SANITY_FLOOR_PCT` (reject < 25 % of market) | ✅ | ✅ | — | — |
| `DISCOUNT_THRESHOLD` (≥ 10 %) | ✅ | ✅ | — | — |
| PPT repdigit-sentinel reject | ✅ `isSentinelPrice` in every `/cards` lookup + `classifyTier` | ✅ `getSealedPrice` _(added 2026-08-30)_ | ✅ `firstPrice` _(added 2026-08-30)_ | ✅ `sealedCatalogRecord` _(added 2026-08-30)_ |
| Aggregate-price divergence guard (> 40 % vs `last_known_price`) | ✅ `scanOneCard` / `cachedConditionPrices` | ❌ none | — | — |
| Structural plausibility (box < pack, < $40 floor) | ❌ (no card-side analogue — see §5) | — | ❌ | ✅ `flagImplausibleSealedPrices` |
| `hasPrice()` render gate | ✅ | ✅ | ✅ (via components) | ✅ (via components) |

Every deal-scan check runs **at the top of the per-listing loop with no
bypass** — verified in `scanCardInMarketplace`, `runSweep`,
`scanProductInMarketplace`. A listing cannot reach an `upsert` without
passing all of the trust + match + threshold + floor gates.

---

## 5. Gaps & inconsistencies found

### Fixed in this review (unambiguous, tiny, sibling-check-exists)

1. **Sealed listings weren't rejecting contested auctions.**
   `isTrustworthyListing` (cards) rejects `AUCTION && bidCount >= 1`;
   `isTrustworthySealedListing` didn't — yet sealed auctions are scanned
   and rendered (`SealedDealCard` has full auction UI). A booster-box
   auction at a transient low current bid could publish as "N % below
   market". Added the identical one-line check.
2. **PPT repdigit sentinels weren't filtered on the catalogue side.**
   `isSentinelPrice` (999 / 9999 / 99999 + `.99`) was applied in every
   `/cards` price lookup and in `sync-watchlist`'s `classifyTier`, but
   **not** in `sync-card-catalog`'s `firstPrice`, `sealedCatalogRecord`,
   or `getSealedPrice`. Live data had **1** such `card_catalog` row
   (Tropical Beach @ $999.99) and **5** `sealed_catalog` rows (Froakie
   Figure Box etc. @ $999.99 — a real value of ~$40–80). `flag
   ImplausibleSealedPrices` did **not** catch these (not Booster Boxes,
   and > $40). Added `isSentinelPrice` to all four spots + nulled the 6
   existing rows.

### Reported — needs a design decision, not changed

3. **Sealed deal-scan coverage is structurally frozen at 48 products.**
   Cards have `sync-watchlist` auto-promoting the whole catalogue into
   the scan set by a $15 value floor. Sealed has **no equivalent** —
   `sealed_watchlist` is a hardcoded seed list, so 2,281 of 2,329
   catalogued products can never surface a deal, and any set not in the
   ~48 (i.e. ~134 of 151) has zero sealed-deal coverage.
   **This is the open "expand sealed-deal scanning" work.** Options:
   - **(a) `sync-sealed-watchlist` job**, mirroring `sync-watchlist`:
     promote `sealed_catalog` rows into `sealed_watchlist` above a value
     floor (e.g. `market_price >= $50`, ~1,400 products) with `source:
     "auto"` + a `retireStaleAutoRows` equivalent. Cost: ~1,400 products
     × 5 countries = ~7,000 `searchListings`/day — **exceeds the current
     ~5,000/day Browse budget on its own.** Needs either a much higher
     value floor (`>= $150` → ~600 products → ~3,000 calls, still large),
     a US-only daily scan with the other countries rotating like the card
     extended tier, or an eBay rate-limit increase.
   - **(b) Booster-box-and-ETB-only auto-promote** (~200 products) — the
     product types users actually chase; ~1,000 calls/day, fits.
   - **(c) Keep it curated but grow the seed list** to ~150 (add the top
     booster box + ETB per mainline set) — cheapest, no new job, but
     stays manual.
   Recommendation: **(b)** — highest signal-to-cost, fits the budget,
   and the browse catalogue already covers the long tail with reference
   prices + a "View on eBay" CTA.

4. **No structural plausibility check for card reference prices.**
   `flagImplausibleSealedPrices` has no card-side analogue in
   `sync-card-catalog`. This is **defensible, not a gap**: cards have no
   equivalent logical invariant (a card can legitimately be $0.50 or
   $50,000; there's no "box vs pack" relationship), and the card scan
   *does* have a plausibility guard at a different layer — the > 40 %
   `last_known_price` divergence check in `scanOneCard`. The sentinel
   filter (fix 2) closes the one concrete class of bad card-catalogue
   price. No change recommended.

5. **Sealed deals get no `getItem` deep-verify.** Cards spend a capped
   budget of `getItem` calls on suspiciously-cheap listings
   (`resolveRawCondition`). Sealed has no equivalent — but sealed also
   has no condition axis (the main thing `getItem` verifies for cards),
   and the `GRADED_CARD_PATTERN` + `SEALED_EXCLUDED_TITLE_PATTERN` +
   `SANITY_FLOOR_PCT` combination already covers the known sealed
   failure modes (graded single mislabeled as a box, empty/repro boxes).
   A sealed `getItem` check could read the eBay item's structured
   condition ("New", "Used") to catch an opened box a seller didn't
   flag in the title. **Low priority; report only.**

### Threshold consistency

The min-count / max-browse thresholds are **consistent in reasoning**,
scaled to each grouping's real size, not arbitrary:

| Const | Value | Rationale |
| --- | --- | --- |
| `CARD_HUB_MIN_LISTINGS` | 2 | a hub with 1 listing duplicates the single `/deals/[id]` page |
| `SET_MIN_LISTINGS` | 3 | a set page is a browsable grid — needs inventory to browse |
| `SPECIES_MIN_LISTINGS` | 5 | a species spans many prints — needs a real range |
| `SET_CATALOG_MIN_CARDS` | 10 | ~2 desktop rows — a real "every card" grid, not a stub while `card_catalog` backfills |
| `SET_SEALED_MIN_PRODUCTS` | 4 | same idea, scaled down — a set has ~5–35 sealed products vs ~60–360 cards |
| `SET_CATALOG_MAX_BROWSE` | 600 | every real expansion renders whole; only grab-bag "sets" (World Championship Decks ~1,960) truncate |
| `SEALED_CATALOG_MAX_BROWSE` | 200 | biggest set has ~41 sealed products — headroom only |

The indexing thresholds (hub/set/species) live in `lib/indexability.js`
with a shared rule ("verified identity + real category + meaningful data
above a per-type minimum"). The catalogue thresholds live next to their
fetchers in `lib/deals.js`. Both are documented; neither is a magic
number that only happened to work.

---

## 6. Recommendations, in priority order

1. **Decide sealed-deal scan expansion (§5.3).** This is the single
   biggest coverage asymmetry in the system and the one with real user
   impact. Recommend option (b): auto-promote Booster Box + Elite
   Trainer Box products (~200) from `sealed_catalog` into
   `sealed_watchlist`, US-daily with the other countries on a rotation,
   fits the Browse budget.
2. **Request an eBay Browse rate-limit increase.** The 5,000/day default
   is already the binding constraint on *card* extended-tier cadence
   (~30-day full rotation) and is what blocks the cheapest sealed-scan
   expansion. The app's affiliate use is the intended Buy-API case. See
   `docs/ebay-rate-limits.md`.
3. **Finish the `card_catalog` backfill** (blocked on the PPT export
   2/day cap) so browse-page reference-price coverage matches the ~29 k
   real catalogue rather than the current ~21 k — tracked in
   `IMPLEMENTATION_STATUS.md`.
4. _(optional)_ A sealed `getItem` condition check (§5.5) if opened-box
   false positives ever show up in practice — not worth building
   speculatively.
