# eBay Browse API rate limiting

## Diagnosis (2026-08-28)

The scan crons had been failing with `429 errorId 2001` ("The request
limit has been reached for the resource"). This is **daily-quota
exhaustion**, not a per-second throttle.

Confirmed live via eBay's Developer Analytics API
(`GET /developer/analytics/v1_beta/rate_limit/?api_context=buy&api_name=Browse`):

| resource | limit | remaining | window | resets |
| --- | --- | --- | --- | --- |
| `buy.browse` | **5,000 / day** | **0** | 86,400 s | ~07:00 UTC (00:00 PT) |
| `buy.browse.item.bulk` | 5,000 / day | 5,000 (unused) | | |

So the app is on eBay's **default Browse tier (5,000 calls/day)** and is
spending the whole allocation, usually by mid-day, after which every
`item_summary/search` and `item/{id}` call 429s until the reset.

### Where the calls go (rough daily budget, after the mitigations below)

| Source | Cron | Calls/day |
| --- | --- | --- |
| US sweep (`searchNewlyListed`, 5 pages) | every 15 min (96×) | ~480 |
| GB/AU/CA/DE/IT sweeps (8 pages each) | every 2 h (12× each) | ~480 |
| Sweep graded lookups (`getGradingDetails`) | per sweep, capped at `GRADED_LOOKUP_CAP = 6` | ~0–500 (usually low) |
| Priority tier (~21 cards × 6 marketplaces) | every 6 h (4×) | ~500 |
| Extended tier (one country-chunk, ~980 cards) | 1×/day | ~980 |
| Sealed products (~194 × 6 marketplaces) | 1×/day at 06:00 UTC | ~1,160 |
| External discovery verify (`ingest-feed`, 1 Browse call per new board item) | hourly, ≤40/cycle, gated at `remaining >= 800` | ~240–720 (hard cap ~960) |

Typical total ≈ **4,150–5,400 / day** (after the EBAY_IT addition, the
sealed-scan expansion, and external-discovery ingestion). This is tight
against the 5,000 cap on purpose-bounded terms: the extended tier defers
first (floor 1,500), then `ingest-feed` skips entirely below `remaining`
800 — so external discovery only runs on the days there is genuine spare
capacity, and can't itself cause an overrun. Raising `ingest-feed` above
hourly / lifting its cap should wait for an approved rate-limit increase.

_Updated 2026-08-31: EBAY_IT added as the 6th marketplace (~575 calls/day
added — sweep + priority + amortised extended + sealed). The extended
tier was re-chunked 6 → 5 so 6 marketplaces still rotate through 30 daily
cron slots; per-country full-rotation cadence is unchanged at ~30 days.
FR/ES/NL remain held for the rate-limit increase; IE/AT/CH ruled out as
too thin. See the marketplace research + tiered-rollout modeling in
`IMPLEMENTATION_STATUS.md`._

## Mitigations applied

1. **Pre-flight quota guard** — `getBrowseRateLimit()` in `lib/ebay.js`
   reads the live `buy.browse` remaining count (from the Analytics API, a
   different resource with its own generous limit). Both scan routes
   (`app/api/refresh-deals`, `app/api/refresh-sealed-deals`) call it once
   up front and **skip the run** (`{ skipped: "ebay_rate_limited" }`,
   HTTP 200) when `remaining` is below a floor. Floors are tier-aware so
   the cheap, user-facing **sweep** keeps running longest and the
   low-priority **extended** tier yields first:
   - sweep / sealed / manual: **250**
   - priority: **600**
   - extended: **1,500**
   A failed meta-call returns `null` → the run proceeds rather than
   blocking on it.
2. **Volume trims** (`vercel.json`): non-US sweeps hourly → every 3 h;
   priority tier every 4 h → every 6 h; sweep `GRADED_LOOKUP_CAP` 10 → 6.
3. **Transient-only retry** — `fetchWithRetry` in `lib/ebay.js` retries
   once on a 5xx / network blip. It **never retries a 429** (that just
   burns more quota and prolongs the block).
4. **Expire-on-empty guard** — `searchListings` now returns
   `{ listings, total }`. The per-card and sealed scanners only expire a
   card's existing deals (`is_active=false`) when the scan is a
   trustworthy view: it matched a listing, or eBay returned a real
   `total` (even `total:0` "nothing for sale"). An empty response with no
   `total` — a degraded/malformed 200, as opposed to a 429 — no longer
   wipes the cached deals the site falls back to. A failed sweep also
   returns a 200 (`skipped:"ebay_error"`) instead of a cron 500.

With the guard in place the daily budget can no longer be *overrun*; at
worst the extended tier is skipped for a day, which is acceptable
(it is confirm/expire duty — the sweep already finds new deals).

## The real fix: request a higher limit

5,000 Browse calls/day is eBay's default for a new app. Apps with a
legitimate, disclosed use case get much higher limits. This app drives
affiliate GMV to eBay (eBay Partner Network), which is exactly the
intended Buy-API use case.

**Action:** in the [eBay Developer Program](https://developer.ebay.com/)
portal, open **Application Growth Check** / submit a **rate limit
increase request** for the Buy → Browse API, describing the use
(affiliate deal aggregation across 5 marketplaces, ~N calls/day, growing).
Until that is granted, keep the mitigations above; once granted, the
`vercel.json` cadences and `EXTENDED_CHUNKS` can be relaxed.

## Re-checking status

```
node -e "require('dotenv').config({path:'.env.local'});
const {getBrowseRateLimit}=require('./lib/ebay');
getBrowseRateLimit().then(r=>console.log(r));"
```
