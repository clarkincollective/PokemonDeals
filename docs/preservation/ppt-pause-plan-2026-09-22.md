# PokemonPriceTracker pause plan — prepared 22 September 2026

**Status: PREPARED, NOT ACTIVATED.** The subscription is active and stays
active. Nothing in this document has been switched on, no billing has been
touched, no saved-data mode exists in the running code, and no provider
request was made to produce any of it. Every finding below came from
reading our own repository and our own database.

This plan exists so that a pause, whenever it happens, is a decision rather
than a discovery.

---

## 1. Where the provider is actually reached

There are **three** outbound doors, all in `lib/pokemonPriceTracker.js`:

- `fetchPPT` (line 18) — the single-attempt request path
- `fetchPPTPaced` (line 40) — the bulk-sync variant that waits out a
  per-minute 429
- `downloadPrintingsExport` (line 552) — **its own inline `fetch`**, because
  it needs `arrayBuffer()` for a gzipped CSV and cannot go through a helper
  that ends in `res.json()`

The third one is the trap. It is the largest single request we make — the
whole catalogue — and a pause flag installed only in the two obvious
helpers would leave it calling out every night. It was missed in the first
pass of this document and found by the test that now pins the count
(`tests/scanner/pause-safety-2026-09-22.test.mjs`).

All three construct their header from `apiKey()`, which throws before any
socket opens when the key is absent, and all three record telemetry through
`recordPptAttempt`. Nothing else in the codebase calls the provider's host;
`lib/priceHistory.js` imports only constants from that module and makes no
request.

Three known doors and a known list of callers behind them is what makes a
pause tractable.

| Caller | Path | What it fetches |
|---|---|---|
| `/api/sync-card-catalog` | cron | `downloadPrintingsExport()` — the bulk catalogue |
| `/api/sync-sealed-catalog` | cron | sealed product references |
| `/api/sync-watchlist` | cron | `searchCard` → the stable tcgplayer id |
| `/api/refresh-deals` | cron | `getConditionPrices`, `getGradedPrice` |
| `/api/refresh-sealed-deals` | cron | `getSealedPrice` |
| `/deals/[id]` | render | `getFullPriceAnalysis` (`unstable_cache`, 300 s) |
| `/sealed-deals/[id]` | render | `getSealedPriceHistory` (300 s) |
| `/cards/[slug]` panel | client → `/api/card-analysis` | `getFullPriceAnalysis` (300 s) |
| `/api/card-search?tcgplayerId=` | request | `getRawPrice`, `getRawPriceHistory` |

---

## 2. What happens today if the key simply stops working

This matters more than any mode we might build, because it is the state the
site would land in if billing lapsed unexpectedly. It was traced call site
by call site.

**Nothing is destroyed.** This was the first thing checked and it holds
everywhere:

- `expireCatalogPrices` (`app/api/sync-card-catalog/route.js:148`) only
  calls `revalidateTag`, and only when `rowsWritten > 0`. It never writes a
  price and never nulls one.
- There is no delete, prune, truncate or null-out path in any sync route.
- `/api/sync-card-catalog` returns at stage `export`
  (`route.js:62`) the moment `downloadPrintingsExport()` throws — **before**
  `snapshotCatalogHistory` runs. So a dead provider cannot write a day of
  `price_history` rows copied from frozen catalogue values. The guard the
  brief asks for already exists structurally; it is not something we would
  have to remember to add.

**Every render path degrades quietly.** `/deals/[id]`,
`/sealed-deals/[id]` and the card-hub analysis panel each wrap their
provider call in `try/catch` and return `null` / `[]` on failure
(`app/deals/[id]/page.js:239-246`, `app/sealed-deals/[id]/page.js:67-73`,
`lib/cardPriceAnalysis.js:15-25`). The pages render from stored data.

**One path returns a 500:** the `tcgplayerId` branch of
`/api/card-search` (`route.js:62-64`). It has **no caller in the site** —
grepping every `fetch` of that route shows only the `q=` catalogue branch,
used by `HeroSearch` and `SearchClient`. So no visitor-facing surface hard-
fails. It should still be given the same stored-data fallback if a pause is
ever taken, because leaving a 500 branch alive is how it becomes someone
else's bug.

**The real consequence is the scanner.** `loadCardMarketData`
(`app/api/refresh-deals/route.js:1518`) and `cachedConditionPrices`
(`:875`) both `return null` when the provider call fails, and both callers
then `continue` / `return` without publishing. That is the correct safe
failure — it never invents a discount — but it means:

> **With the subscription paused and no code change, deal discovery stops.
> Existing deals keep rendering, ageing and expiring; no new one is ever
> published.** The site does not break, it slowly empties.

That is the single fact that decides whether a pause is acceptable, and it
is the one thing a saved-data mode has to address.

---

## 3. The smallest saved-data mode (specified, deliberately not built)

Two parts. The first is trivial and safe. The second changes how a
comparison price is chosen, which is a pricing change and therefore needs
an explicit decision — it is specified here and **not implemented**.

### Part A — close the door (safe, reversible, ~10 lines)

A single environment flag, absent everywhere today:

```
PPT_SAVED_DATA_MODE=1
```

Read once at the top of **all three** doors — `fetchPPT`, `fetchPPTPaced`
and `downloadPrintingsExport` — and when set, throw a distinguishable
`PptPausedError` before constructing headers, so no request is attempted
and no key is needed. Reversal is deleting the variable — no deploy, no
code revert.

Why this is worth having even though a dead key already throws: it makes
the paused state *intentional and legible*. Telemetry (`recordPptAttempt`)
stops logging authentication failures as errors, the cron routes report a
clean paused status instead of a provider outage, and nobody debugging in
six months mistakes a deliberate pause for a broken integration.

### Part B — give the scanner a stored reference (a pricing change; needs approval)

`card_catalog` holds `market_price` plus `market_condition` and
`market_printing` — the labels that say *what the figure is for*. That is
the same product id, from the same provider, that `getConditionPrices`
would return; it is simply our stored copy rather than a live one.

**§7 is the full field-by-field specification**, measured against the
verified backup rather than assumed. Read it before acting on this
section: the headline coverage figure is not 83.6 % once you ask what the
scanner actually needs, and one whole lane has no stored reference at all.

Sourcing the reference from there instead would keep discovery running on
frozen prices. Three rules are not negotiable if it is ever done:

1. **`reference_observed_at` must be `NULL`.** `card_catalog` records only
   `synced_at` — *our* copy time — and
   `lib/referenceProvenance.js:14-25` is explicit that a sync time is never
   evidence of when a price was true. A stored value read a second time
   does not become newly observed. The consequence is deliberate and
   correct: `postReleaseReference` in `lib/dealQuality.js` will refuse
   savings claims on tracked releases, because a frozen reference genuinely
   cannot prove it post-dates a set that launched after the freeze.
2. **`reference_source` must be `card_catalog`, not `ppt_live`.** The
   provenance vocabulary already carries that value.
3. **No new `price_history` rows.** `snapshotCatalogHistory` must stay
   behind the successful-export gate. Re-reading a frozen catalogue value
   365 times must never produce 365 days of flat history — that would
   corrupt the one asset a pause cannot rebuild, and it would silently
   corrupt the sitemap's lastmod evidence with it (§4).

Only a single reference-selection call site changes. Deal quality, savings
eligibility, the matcher and the displayed figures are untouched.

---

## 4. What depends on fresh references, and what does not

Checked individually rather than assumed.

**Unaffected by a pause — evidence already banked:**

- **Merchant Listing schema.** The `Offer` node on `/deals/[id]`
  (`page.js:610-623`) and the offer array on `/cards/[slug]`
  (`page.js:362-373`) carry the *listing's* own price, currency,
  availability and condition — all eBay-sourced. The provider contributes
  nothing to the part Google reads for rich results. Nothing here regresses.
- **Sitemap indexability.** The substance gate
  (`lib/cardSitemap.js:189`) keeps a card that has live listings, a real
  `<lastmod>`, or an editorial link. The lastmod comes from
  `card_reference_lastmod()`, whose window is `observed_on <= current_date
  + 1` — an upper bound with **no lower bound**
  (`supabase/card_reference_lastmod_migration.sql:99`). A proven past price
  change is a permanent historical fact. The sitemap does not shrink over
  time on a pause.
- **Price charts and the history spine.** Served entirely from
  `price_history` — 1,845,238 rows, 27 Jan 2025 → 21 Sep 2026 — which is
  backed up in full (§5).
- **Deal freshness, expiry and the stale sweep.** Driven by eBay
  verification timestamps, not by the provider.

**Degrades on a pause:**

- **New savings claims on newly released sets**, by design — see §3 rule 1.
  Existing stored claims are unaffected; they were evidenced when written.
- **The "Market reference" and "Below reference" `PropertyValue` entries**
  on a deal page's structured data, which are gated on the same
  `showSavings && showRef` as the visible figures. They drop out together
  with the visible claim, so the page and its markup stay consistent — the
  markup never asserts something the page does not show.
- **Rankings that sort by discount** thin out as new below-market listings
  stop being published, rather than becoming wrong.
- **Sealed product** degrades first and hardest: `sealed_catalog` carries
  no provider as-of column at all, so sealed references are the least able
  to evidence themselves after a freeze.

---

## 5. The backup

Written by `scripts/preservation/backup.mjs` — read-only against our
database, with **no provider client in the file at all**, so it cannot make
a request even by accident. Storage is `.local/backups/<cutoff>/`, which is
git-ignored, outside `public/`, and in no storage bucket. No credential is
read into the output, printed, or recorded in the manifest.

The provider's terms (read 22 Sep 2026) permit retaining data retrieved
under an active subscription indefinitely, including after the subscription
ends, and describe caching it to serve our own application as expected.
They exclude a *bulk retrieval of the catalogue undertaken in anticipation
of cancellation*, and prohibit resale or redistribution permanently. Copying
our own database stays on the permitted side of that line; this script
could not cross it if we wanted it to.

Fourteen tables, 2,029,862 rows. The first draft of the script covered
eight; the other six were found by grepping every `.from("…")` in the
codebase rather than trusting the first list, and each one turned out to
hold something the eight could not reconstruct:

- **`catalog_snapshot`** (37,386) — the derived aggregates several pages
  render from (`cardHubs`, `catalogSets`, `setVocabulary`), the
  browse-budget ledger, and the `ppt_requests:*` telemetry. That telemetry
  is the only record of what we actually retrieved and when — the baseline
  any pause decision is measured against — and `lib/pptTelemetry.js:211`
  sweeps it after **35 days**. It was going to delete itself.
- **`listing_observations`** (34,848) — per-observation pricing *with*
  `reference_*` provenance: the audit trail behind every stored comparison.
- **`discovery_events`** (28,010), **`scan_target_state`** (7,429),
  **`ebay_job_runs`** (2,818), **`scan_allocation_runs`** (86).

Deliberately excluded, recorded in the script so the omission cannot be
mistaken for an oversight: `newsletter_subscribers` and `price_alerts`
(email addresses — not pricing data, not needed to survive a pause, and
copying subscriber emails onto a laptop is a privacy cost with no
preservation benefit), the `social_*` tables (publishing records,
regenerable), and `cards` (one legacy row).

Row counts, digests and verification results: see the handover.

### Where the copies are

| Copy | Location | Off-device? |
|---|---|---|
| Primary | `.local/backups/2026-09-21T20-56-14-157Z/` (inside the repo, git-ignored) | Incidentally — the repo sits under `C:\Users\James\OneDrive\`, so OneDrive replicates it |
| Second | `C:\Users\James\pokemondealfinder-preservation\2026-09-21T20-56-14-157Z\` | No — same disk, outside the OneDrive tree and outside any repo |

Both verified independently: 14/14 tables, and all 15 files plus the
manifest are byte-identical between them.

**State this honestly rather than calling the backup protected.** The
second copy defends against the likely accidents — a `git clean -xdf`, a
stray `rm`, a OneDrive sync deleting the first copy — because it is
outside both the repo and the sync root. It does **not** defend against
losing the machine. The only current off-device protection is OneDrive
replication of the primary, which is incidental rather than designed: the
backup landed inside a synced folder because the repo happens to live
there, not because anyone chose it as a destination.

No dedicated object storage is configured — there is no Blob, S3 or R2
credential in the environment. Supabase Storage exists and would fit the
~40 MB, but it is the *same failure domain as the source data*: a copy of
the database inside the same Supabase project protects against very
little. A removable USB volume is attached, but it is a Windows installer
stick, and business data should not go onto removable media without an
explicit decision. If genuine off-device protection is wanted, that is a
destination choice for the owner, not something to assume.

### Two defects the first run exposed

Worth recording, because both would have produced a backup that looked fine.

**A sort column that did not exist voided the whole run.** `integrity_snapshots`
is keyed on `day`, not `id`. The script threw on it — the last of eight
tables — and exited before writing the manifest, discarding eighteen
minutes of `price_history` streaming and leaving eight good files that
nothing could verify. Per-table failures are now recorded in the manifest
and stepped over, and `--resume=<dir>` adopts a file already on disk
(digesting and counting it from the bytes) instead of re-fetching it.

**Offset paging over a non-unique sort can silently skip or duplicate
rows.** `scan_target_state` is keyed on `(card_tcgplayer_id, marketplace)`
and neither column is unique alone. A single-column sort would have
produced a file that passed every digest check while being a perfect copy
of the wrong thing. `orderBy` is now a column *list*.

---

## 6. What now holds these invariants in place

Every finding in §2 and §4 held by convention only — nothing stopped a
later edit from breaking one, and the breakage would have been silent. A
route that writes a year of flat prices, or a reference that claims to have
been observed on the day it was merely re-read, looks exactly like working
code.

`tests/scanner/pause-safety-2026-09-22.test.mjs` pins them: the export
bail-out sitting before the history snapshot, the cache expiry touching no
row, the absence of a delete path, `reference_observed_at` never being
filled from a sync time or the clock, the lastmod SQL having no lower
bound, each render path's fallback, and the count of outbound doors. That
last assertion is what corrected §1 within a minute of being written.

---

---

## 7. The scanner fallback, specified

Every figure below was measured against the verified backup
(`2026-09-21T20-56-14-157Z`), not estimated. Nothing here is built.

The rule that governs all of it: **a stored figure may only price a
listing whose condition, printing or grade it was actually recorded
for.** No aggregate stands in for a tier, no Near Mint figure stands in
for an unknown condition, and no raw figure stands in for a slab. Where
the stored data cannot answer, the scanner declines and publishes
nothing — which is what it already does today when a provider lookup
fails.

### 7.1 What `loadCardMarketData` returns, and what would replace it

`getConditionPrices` returns a **full ladder**: `byCondition`
(tier → price), `byConditionReference` (tier → `{price, condition,
printing}`), an aggregate `fallbackPrice` with its own
`fallbackReference`, and `lastUpdated` — the provider's own as-of.

| Field consumed by the scanner | Offline source | Status |
|---|---|---|
| `byCondition[tier]` | `card_catalog.market_price`, **only when** `market_condition` = that tier | partial — one tier only |
| `byConditionReference[tier].condition` | `card_catalog.market_condition` | present |
| `byConditionReference[tier].printing` | `card_catalog.market_printing` | present |
| `fallbackPrice` / `fallbackReference` | **nothing** | absent — and must not be faked |
| `lastUpdated` (provider as-of) | **nothing** | absent — `card_catalog` stores only `synced_at`, our copy time |

### 7.2 Raw cards, by condition and printing

**Stored fields:** `card_catalog.tcgplayer_id`, `market_price`,
`market_condition`, `market_printing`, `language`, joined to
`watchlist.justtcg_tcgplayer_id`.

**Coverage, measured:**

- `card_catalog` holds 29,503 rows, 24,670 priced. Of those priced,
  **98.8 % are labelled Near Mint**, 1.2 % carry a null condition, and 4
  rows are Lightly Played. It is a Near-Mint-only reference table.
- One printing per card: Normal 56.2 %, Holofoil 37.1 %, Unlimited
  3.1 %, Reverse Holofoil 2.9 %.
- Of 8,453 **active** scanner targets, 4,987 (59.0 %) exist in
  `card_catalog` at all; 4,733 are priced there; **4,623 (54.7 %) carry
  both condition and printing** and are therefore offline-priceable.

**What listings it can actually serve.** Detected condition across
31,758 raw deal rows: Near Mint 73.2 %, "Ungraded" 16.1 %, "Unknown"
6.6 %, Lightly Played 3.2 %, then a multilingual tail.

- Near Mint listing + stored NM reference + matching printing → **priced,
  exactly as today**.
- Lightly Played and worse → **declined.** `selectConditionPrice` already
  walks *down* the ladder and never up, returning `null` when no worse
  tier exists. With only NM stored there is no worse tier, so it returns
  null and the scanner skips. This is the correct outcome and requires no
  new rule — the existing function produces it.
- "Ungraded" / "Unknown" / "Used" / foreign-language equivalents (~23 %)
  → today these are unrecognised tiers that fall through to
  `fallbackPrice`. Offline there is no attributable aggregate, and the
  stored NM figure must **not** be substituted: that would stamp an
  unknown-condition listing against a Near Mint reference. **Declined.**

**Missing coverage, stated plainly:** four of the five raw condition
tiers, the aggregate fallback, and every printing other than the one
stored per card.

**The cheapest fix, and it is a large one.** `downloadPrintingsExport()`
already returns, per (card, printing): `marketNearMint`, `marketPrice`,
`marketLightlyPlayed`, `marketModeratelyPlayed`, `marketHeavilyPlayed`
and `marketDamaged`. `app/api/sync-card-catalog/route.js` reads the whole
ladder into `c.prices`, uses it only to sanity-check via
`ladderInverted`, and then **persists exactly one figure per card** —
discarding four tiers and every non-chosen printing every single night.

Persisting what we already download would turn a Near-Mint-only table
into the full ladder the offline scanner needs. It is a *storage* change,
not a pricing change: no displayed figure moves, because the figure
chosen for display is still `pickCatalogMarketReference`'s. It needs a
migration (a `card_catalog_prices` child table keyed on
`(tcgplayer_id, printing, condition)`, or ladder columns on the existing
row) and it must run **while the subscription is active** — but it is
not an extra retrieval, an extra request or an extra charge. It is
writing down more of a response we already pay for and already receive.

**This is the single highest-value change before any cancellation.**

### 7.3 Japanese cards — no stored reference exists

`card_catalog` is **English-only**: all 29,503 rows are
`language: "english"`. Of the 8,453 active targets, **3,466 are Japanese
and none has a catalogue row.** They are priced today exclusively by live
`getConditionPrices(id, "japanese")` calls.

Offline, the entire Japanese lane goes dark — including `/japanese-cards`,
which the sitemap advertises as an hourly-changing hub.

There is no fix that stays inside the current instructions. Building a
Japanese catalogue snapshot means expanding normal retrieval, which the
owner has ruled out, and a catalogue sweep taken in preparation for
cancelling is specifically on the excluded side of the provider's terms
(§5). **A pause therefore means accepting that the Japanese lane stops,
unless the owner raises it with the provider first.** Recorded here as a
decision, not a task.

### 7.4 Graded cards, by grader and grade

**Stored fields:** `deals.reference_grader`, `reference_grade`,
`reference_amount`, `reference_currency`, `reference_observed_at` — on
individual deal rows only.

**Coverage, measured:** 718 graded deal rows exist; **96 (13.4 %) carry
grader + grade + a usable amount**. Those collapse to **82 distinct
(card, grader, grade) references across 74 cards** — against 8,453 active
targets, i.e. **0.9 %**.

`getGradedPrice` is a live `includeEbay=true` lookup with a confidence
gate (`gradedTierConfidence`, which already fails closed and returns
`null` on a thin or incoherent bucket). **No graded reference is
persisted at catalogue level anywhere.** `graded_sales` and `raw_sales`
are both empty tables.

**Missing coverage:** effectively all of it. The 82 stored references are
per-listing snapshots, not a reusable reference table, and a new slab for
a card that has never had a graded deal has no reference at all.

**Specification:** in saved-data mode the graded path **declines
unconditionally.** Do not price a slab against a raw figure — a PSA 10 is
not a Near Mint card, and `gradedTierConfidence` exists precisely to stop
that comparison being made even with live data. Graded discovery stops
until the subscription resumes. Existing graded deals continue to render
from their own stored references and are still availability-checked by
the eBay lane (§7.6).

### 7.5 Sealed products

**Stored fields:** `sealed_catalog.tcgplayer_id`, `market_price`,
`language`, `synced_at`, joined to `sealed_watchlist.tcgplayer_id`.

**Coverage, measured:** 2,349 rows, **99.7 % priced**, against 196 active
sealed watchlist products.

Sealed is the one lane that works offline, and for a structural reason:
a sealed product has no condition, no printing and no grade, so a single
stored price is a *complete* reference rather than one rung of a ladder.
`refresh-sealed-deals` already prefers a stored catalogue figure and
treats live `getSealedPrice` as the fallback for stragglers — so the
offline path is close to the path it already takes.

**Missing coverage:** `sealed_catalog` has **no provider as-of column at
all**, so every sealed reference is `reference_observed_at: NULL` and
cannot certify a post-release comparison. That is already true today; it
is not a new consequence of pausing. `storedSealedReferenceEvidence`
handles it.

### 7.6 Closing the three doors, and what keeps running

`PPT_SAVED_DATA_MODE=1` is read at all three outbound calls and throws
`PptPausedError` before any header is built:

| Door | Callers stopped |
|---|---|
| `fetchPPT` | `getConditionPrices`, `getGradedPrice`, `getRawPrice`, `getRawPriceHistory`, `getFullPriceAnalysis`, `getSealedPrice`, `getSealedPriceHistory`, `searchCard` |
| `fetchPPTPaced` | the bulk-sync variants behind `sync-watchlist` and `sync-sealed-catalog` |
| `downloadPrintingsExport` | `sync-card-catalog` — its own inline `fetch`, and the largest request we make |

**Untouched, because they never import the provider** (verified by grep):
`/api/verify-deals`, `/api/sweep-stale-deals`, `/api/refresh-catalog`,
`/api/ingest-feed`, `/api/check-alerts`. So eBay availability checking,
staleness sweeping, aggregate recomputation, feed ingest and email alert
checks all keep running on their existing schedules during a pause.
Listings still expire, still get re-verified, and still disappear when
they sell. Only the *reference* freezes.

### 7.7 Timestamps, freshness and savings rules

1. **Never stamp a new `reference_observed_at`.** A catalogue-sourced
   reference carries `NULL`, because `card_catalog` stores only
   `synced_at`, and `lib/referenceProvenance.js:14-25` is explicit that a
   sync time is never evidence of when a price was true. The consequence
   is intended: `postReleaseReference` will refuse savings claims on
   tracked releases, because a frozen figure genuinely cannot prove it
   post-dates a set that launched after the freeze.
2. **Never destroy an existing one.** This is a real hazard, not a
   theoretical one. `tryUpsert` in `refresh-deals` writes
   `Object.assign(core, reference ?? clearedReference(CARD_REFERENCE_COLUMNS))`
   — a sighting with no reference **nulls every reference column on the
   row**. That is correct today, but offline it means each re-sighting of
   a listing we decline to price would wipe its banked provenance.
   **15.7 % of deal rows (5,113) carry a real `reference_observed_at`.**
   The offline path must skip the write, or preserve the existing
   reference columns, rather than clearing them.
3. **`reference_source` is `card_catalog`, never `ppt_live`.** The
   provenance vocabulary already carries that value.
4. **No new `price_history` rows.** `snapshotCatalogHistory` must stay
   behind the successful-export gate, so re-reading a frozen value 365
   times never becomes 365 days of flat history.
   `tests/scanner/pause-safety-2026-09-22.test.mjs` pins this.
5. **Savings and freshness rules are unchanged.** Nothing in
   `lib/dealQuality.js` needs editing. `savingsClaimTrusted`,
   `storedReferenceEvidence`, `referenceIsPlausible` and the freshness
   gates all read the stored row and already fail closed on missing
   evidence. A declined listing simply never reaches them.

### 7.8 Resuming

Deleting `PPT_SAVED_DATA_MODE` restores live pricing on the next cron
cycle — no deploy, no code revert. The catalogue sync runs at 02:00 and
rewrites `card_catalog` with fresh figures and real provider as-ofs;
`refresh-deals` resumes live per-card lookups within 15 minutes; graded
discovery resumes with the next allocated run. No backfill is needed and
none should be run: the gap is a genuine gap in observation, and
`price_history` should show it as one.

### 7.9 The smallest change that makes cancellation operationally safe

In dependency order:

1. **Persist the full condition ladder the nightly export already
   returns** (§7.2). Migration plus a sync-write change. Everything else
   is cosmetic without it, because a Near-Mint-only table serves 73 % of
   listings for 55 % of targets.
2. **Add `PPT_SAVED_DATA_MODE` to all three doors** (§7.6). ~10 lines,
   reversible by deleting a variable.
3. **Add the catalogue-sourced reference path to `loadCardMarketData`**,
   with `reference_source: "card_catalog"`, `reference_observed_at: NULL`,
   and a hard decline whenever condition, printing or grade is not an
   exact match (§7.2, §7.4).
4. **Stop `tryUpsert` clearing banked provenance on a declined sighting**
   (§7.7 rule 2).
5. **Decide the Japanese lane** (§7.3) — the only item here that is a
   business decision rather than an engineering one.

Items 1–4 are a day's work and change no displayed figure. Item 5 cannot
be solved in code.

---

## 8. If a pause is ever taken

In order. §7.9 is the engineering prerequisite list; this is the
operational sequence around it.

1. Build items 1-4 of §7.9, and decide item 5 (the Japanese lane).
   Without §7.9 item 1 the fallback covers only Near Mint listings for
   55 % of targets; without item 5 the Japanese lane simply stops.
2. Take a fresh backup on the day of the pause, so the cutoff is the
   freeze, and copy it to the second location (§5).
3. Set `PPT_SAVED_DATA_MODE=1` and confirm from telemetry that all three
   doors report zero outbound attempts for a full cron cycle.
4. Give `/api/card-search`'s `tcgplayerId` branch a stored-data fallback.
5. Leave the crons scheduled. They will run, find the door closed, and
   report a paused status — which is a heartbeat worth having.
6. Only then change billing.

Reversal is the same list backwards, and step 3 alone restores live pricing
within one cron cycle (§7.8).
