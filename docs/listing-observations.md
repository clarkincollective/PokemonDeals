# Listing observation log (SEO-2.5)

Append-only record of what the deal system concluded about a listing, once
per UTC day. **Not a public page.** This documentation will eventually
underpin the methodology section of any published research.

## Why it exists

`deals` holds one row per `(source, marketplace, listing_id)` and is upserted
with `ignoreDuplicates: true`, so a re-sighting writes nothing new.

* A **fixed-price** listing's `price`, `market_price` and `discount_pct` are
  written at first sighting and never updated. Every later state is lost.
* An **auction** is the opposite: `verify-deals` re-prices the row in place as
  bids arrive, so earlier bids are overwritten.

Measured 2026-09-16: 28,927 listing rows, **zero** observation history, and
only 4.2% of rows carrying reference provenance (those columns arrived at
17C.10). Every day without this table was a day of market history that could
not be reconstructed afterwards.

## What one row means

**One listing, on one marketplace, on one UTC day.** Not a scan sighting.
The scanner re-sights an active listing many times a day; a partial unique
index collapses those to one row.

```
UNIQUE (source, marketplace, listing_id, observation_date) WHERE kind = 'daily'
```

### kinds

| kind | meaning |
|---|---|
| `daily` | the once-per-UTC-day snapshot. The research unit. |
| `transition` | an explicit extra row for a meaningful same-day change. Exempt from the unique index. |
| `backfill` | a one-off snapshot of the state `deals` happened to retain when the table was created. **Not observed history — exclude from all time series.** |

## Semantics

**Price.** `price`, `shipping` and `total_price` are stored separately, in the
listing's own `currency`, alongside the `total_price_usd` the system already
computed. Never compare an item-only price with a shipping-inclusive one.

**Reference.** `market_price` is the reference the discount was computed
against; `reference_amount`, `reference_currency`, `reference_source` and
`reference_observed_at` are its provenance where recorded. **A historical
discount must be reproduced from these, never from a current catalogue
price.** Rows written before 17C.10 have no provenance and their discount is
trusted but not independently evidenced.

**Identity.** `watchlist_id` is the card the system believed the listing was
*at that moment*. Resolve card and set through it. Do not re-run identity
matching later: a listing can be reassigned, and the point-in-time link is
what makes history honest.

**Condition, grade, language, listing type.** Stored as the system normalised
them, so future analysis stays like-for-like. Auctions must never be pooled
with fixed-price listings in a discount study.

**Screening.** `disqualified_reason` and `visual_authenticity_status` travel
with the observation. A disqualified listing is still observed; it is excluded
at analysis time, not dropped at write time. Roughly 26% of stored listings
carry a disqualification.

**Availability.** `is_active` records whether the listing was live. A listing
ceasing to be active means **it became unavailable**, not that it sold. eBay
listings end for many reasons and we do not observe sales.

## What it is not

Non-authoritative. Nothing that serves a page, qualifies a deal, prices a
listing, screens a card or allocates scanner budget reads this table, and a
test pins that. It records conclusions; it never produces one and never feeds
one back. A failed write cannot fail a scan.

## Privacy

`seller_username` and `seller_feedback_pct` are present on the normalised
listing object and are **deliberately not stored**. Enforced by construction:
the writer copies an explicit allowlist (`OBSERVATION_FIELDS`), so a new field
cannot arrive by accident. Speculative future research is not a reason to
retain identity data.

## Known biases

Inherited from the scanner, and any published research must state them:

* Only watched cards are searched — 8,743 of 29,460 English catalogue cards.
* Six eBay marketplaces only.
* A 10% minimum discount applies at scan time.
* `SANITY_FLOOR_PCT = 0.25` is passed as `minPrice` into the eBay query, so
  listings below a quarter of the reference are **never fetched**. The
  observable discount distribution is right-censored at exactly 75%.
* 26–28 Aug 2026 is scanner ramp-up: 74% of all listing rows were created in
  those three days. Exclude that window from frequency analysis.

## Operational

Written from `writeDiscoverySighting` in `lib/listingAvailability.js` — the
single lifecycle boundary both discovery callers pass through, after
identity, pricing, reference and condition are settled.

Outcomes: `written`, `duplicate` (same-day repeat, the common case),
`absent` (migration not yet run), `skipped`, `error`. Only a genuine
missing-table error counts as `absent`; a permission or network failure stays
visible as `error`.

Storage projection at current volumes (~1,916 observations/day):

| Window | Rows | With indexes |
|---|---:|---:|
| 30 days | 57,000 | ~23 MB |
| 90 days | 172,000 | ~69 MB |
| 365 days | 699,000 | ~280 MB |

## Retention

Never `UPDATE` or `DELETE` a row. The history is the asset, and it does not
become worthless when the listing disappears — a listing that ended is
precisely what persistence analysis needs.
