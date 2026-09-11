# Sold-item freshness

How the site decides that an eBay listing is still available, sold, or
unknown, and how that decision is stored, protected, recovered and shown.
Code: `lib/listingAvailability.js`. Traced against live eBay responses on
2026-09-11.

## Provider call

One Browse API call per row: `GET /buy/browse/v1/item/get_item_by_legacy_id`,
with `X-EBAY-C-MARKETPLACE-ID` set to **the row's own marketplace**. The
verdict speaks for that marketplace's row only.

## Fields used

| Field | Used for |
|---|---|
| HTTP status | 404/410 = not found in this marketplace; 429, 401, 403, other non-2xx = inconclusive |
| `estimatedAvailabilities[]` | every entry is read, not just the first |
| `estimatedAvailabilities[].estimatedAvailabilityStatus` | `IN_STOCK` / `LIMITED_STOCK` = positive; `OUT_OF_STOCK` = sold out |
| `estimatedAvailabilities[].estimatedRemainingQuantity` | `0` = sold out; otherwise informative only |

## Fields deliberately not used for a verdict

| Field | Why |
|---|---|
| `itemEndDate` | The listing's end time. It is **not** documented as a sale timestamp: a listing also ends when the seller ends it or its duration runs out. In the 2026-09-11 trace, live fixed-price listings had no `itemEndDate`, live auctions carried their scheduled end, and the 25 sold-out items carried a past one. |
| `estimatedSoldQuantity` | Cumulative units sold; says nothing about whether any remain. |
| `estimatedAvailableQuantity`, `availabilityThreshold*` | Not needed once status and remaining quantity are read; not always present. |

## Verdicts

| Response | Verdict | Scope | Write |
|---|---|---|---|
| 200, every entry `OUT_OF_STOCK` or remaining `0` | SOLD | the eBay item | this row only: `is_active=false`, `disqualified_reason='availability:sold'`, `exact_verified_at=now` |
| 200, every entry `IN_STOCK`/`LIMITED_STOCK`, no remaining `0` | ACTIVE | the eBay item | `last_seen_at` and `exact_verified_at` set to the **same** timestamp |
| 404 / 410 | ENDED | this marketplace only | this row only: `disqualified_reason='availability:not_found_in_marketplace'` |
| 200 with no, unrecognised or mixed availability entries | UNKNOWN | none | no write |
| 429, 401, 403, other non-2xx (5xx after one retry), network failure, unparseable body | UNKNOWN | none | no write |
| auction re-priced below the 10% floor | price retirement | this row | `is_active=false`, no availability reason |

Cross-market propagation is deferred: a verdict is never written to the
same item's rows in other marketplaces.

Live-response trace (2026-09-11): 25 of 25 genuine verifier retirements
re-read as HTTP 200 `OUT_OF_STOCK`, remaining 0; one further retirement
re-read as `IN_STOCK` (restocked or relisted, cause unknown); 8 of 8 live
listings sampled (4 auctions, 4 fixed-price, US/GB/AU/CA/DE) carried an
explicit `IN_STOCK` entry with remaining quantity. No 404 was observed, so
the not-found row of the table is untested against live data.

Measured lag, 25 sold-out rows: **listing end time to retirement check**,
median 8.7 h, maximum 40 h. Because `itemEndDate` is not a documented sale
timestamp, this is not a sale-to-retirement measurement.

## Persistence and discovery writers

The reason lives in the existing `deals.disqualified_reason` (text). Any
non-null reason fails `isDisplayableDeal`, so the row is hidden on every
read path. Discovery writers (`refresh-deals` per-card scan and sweep,
`ingest-feed`) never send that column and write through
`writeDiscoverySighting`:

1. guarded `UPDATE ... WHERE key AND (disqualified_reason IS NULL OR disqualified_reason NOT LIKE 'availability:%')`
2. if nothing updated: `INSERT ... ON CONFLICT DO NOTHING`
3. if that conflicted: the guarded update once more (another writer inserted meanwhile)
4. still nothing: the row is retired. The sighting is recorded **only** by
   changing `availability:sold` to `availability:sold:seen_again` (or the
   not-found equivalent). `last_seen_at` and `is_active` are untouched.

Third-party board presence (`ingest-feed`) is a discovery hint only and never
writes `last_seen_at`.

## Recovery (restocked or regional listings)

A retired row only comes back through an exact lookup **in its own
marketplace** with positive availability. `verify-deals` takes at most one
candidate per run:

- `disqualified_reason` ends in `:seen_again` (a later same-marketplace search sighting)
- `listing_type = 'FIXED_PRICE'`
- last check between 24 hours and 14 days ago

The slot is taken **out of** the existing batch of 20 (the allocator gets
19), so per-run calls, the 800-call reserve and the 30-minute cadence are
unchanged. Outcomes, written only if the row still carries the marker read:

| Lookup | Result |
|---|---|
| ACTIVE, price + shipping + currency within 1% of the stored deal | reactivated; `last_seen_at = exact_verified_at = now` |
| ACTIVE, price moved | reason cleared, row stays inactive; the next discovery sighting re-qualifies it at the live price |
| SOLD | `availability:sold`, check time stamped |
| ENDED | `availability:not_found_in_marketplace`, check time stamped |
| UNKNOWN | marker consumed, nothing else written |

Every outcome consumes the marker, so a row is re-checked again only after
another sighting and another 24 hours.

## What the deal page says

- "Availability confirmed on eBay {time}" only when `exact_verified_at`
  and `last_seen_at` are the same instant. Only a successful active verdict
  writes both with one timestamp, so equality proves the latest evidence was
  a positive exact check. Legacy rows retired and then revived by the old
  code, or confirmed and then sighted again, fail this test.
- Otherwise "Last seen in eBay listings {time} · not individually re-checked since".

## Premium placement

Best Deals, Auctions Ending Soon, Just Added, the digest and the (suspended)
social gate all go through `isPremiumDealEligible`, whose freshness check
(`isExactVerifiedFresh`) now applies the **same** rule
(`isPositiveActiveConfirmation`) plus the existing 12-hour window. A recent
retirement timestamp never qualifies, UNKNOWN never writes one, and a later
search sighting conservatively ends eligibility until the next successful
check.

## Caches

A retirement or recovery reactivation expires, once per card per run and
immediately: the card's offers caches and `/cards/[slug]` page (tag
`card-offers:w:<watchlist id>` / `card-offers:t:<tcgplayer id>`, which Next
copies onto the page's ISR entry) and the deal page (`deal-detail:<id>`).
No cache window was shortened.

## Concurrency test

`tests/db/sold-freshness-concurrency.mjs` runs the SQL above on two
concurrent connections against a disposable **local** Postgres (it refuses
any other host), with the repo's schema files and both `deals` triggers
loaded, in both commit orders. It does not exercise PostgREST itself, nor
any production trigger or policy missing from `supabase/*.sql`.

```
TEST_DATABASE_URL=postgres://user:pw@localhost:PORT/db PG_MODULE_BASE=<dir with node_modules/pg> \
  node tests/db/sold-freshness-concurrency.mjs
```
