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

`card_catalog` already holds what the scanner needs for 24,664 of 29,503
cards (83.6 %): `market_price`, plus `market_condition` and
`market_printing` — the labels that say *what the figure is for*. That is
the same product id, from the same provider, that `getConditionPrices`
would return; it is simply our stored copy rather than a live one.

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

Row counts, digests and verification results: see the handover.

---

## 7. What now holds these invariants in place

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

## 6. If a pause is ever taken

In order:

1. Decide Part B (§3) explicitly. Without it, discovery stops.
2. Take a fresh backup on the day of the pause, so the cutoff is the freeze.
3. Set `PPT_SAVED_DATA_MODE=1`.
4. Give `/api/card-search`'s `tcgplayerId` branch a stored-data fallback.
5. Leave the crons scheduled. They will run, find the door closed, and
   report a paused status — which is a heartbeat worth having.
6. Only then change billing.

Reversal is the same list backwards, and step 3 alone restores live pricing
within one cron cycle.
