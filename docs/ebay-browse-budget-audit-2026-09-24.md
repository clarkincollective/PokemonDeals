# eBay Browse budget audit — 2026-09-24 (read-only)

No enforcement was enabled, no cap was changed, no scheduler was touched.
Every figure below is read from the `catalog_snapshot` budget ledger
(`browse_budget_observe:<window>`) and from the code paths that spend calls.

## Headline

`browseBudgetMode()` returns **`off`**. Nominal caps are observational: they
record *hypothetical* decisions and do not prevent a single real call. The
binding constraint is eBay's external **5,000/day**, and the account is
genuinely near-exhausted every day — the ledger's own `lastObservation`
recorded **`remaining: 240`** at 06:30 on 2026-09-24 and **`230`** the day
before, half an hour before the 07:00 reset.

| window ending | total | sealed | sweep:US | allocated | verify | ingest | unleased |
|---|---|---|---|---|---|---|---|
| 2026-09-24 | 4,988 | 196 | 1,091 | 2,345 | 440 | 305 | 0 |
| 2026-09-23 | 4,788 | 196 | 932 | 2,307 | 400 | 384 | 0 |
| 2026-09-22 | 4,995 | 196 | 1,006 | 2,339 | 420 | 360 | 22 |
| 2026-09-21 | **5,035** | 196 | 998 | 2,220 | 440 | 423 | 95 |
| 2026-09-20 | 5,028 | 196 | 1,051 | 2,369 | 380 | 353 | 35 |
| 2026-09-19 | 5,000 | 196 | 1,018 | 2,311 | 440 | 360 | 0 |

## Why `sweep:EBAY_US` reaches ~1,000 against a nominal 790

From the ledger's own request record for the window ending 2026-09-24:

| | |
|---|---|
| cron schedule | `*/15` → **96 runs/day** |
| runs that actually leased | **68** (28 skipped by the pre-flight rate-limit guard) |
| calls requested | 1,496 (**22.0/run**) |
| calls actually drawn | **1,091** (**16.0/run**) |
| logical work per run | ≤5 `searchNewlyListed` pages + ≤3 graded lookups = **≤8** |
| nominal cap derived from | 8 × 96 = **768** |

**The gap is retries, and it is structural.** `lib/ebay.fetchWithRetry` runs
with `retries = 1` and draws a lease unit **per attempt**, before the request
is sent; `recordBrowseCall()` likewise fires per answered attempt. So one
*logical* lookup costs up to **two real external calls**. The observed 16.0
draws per run is almost exactly 2× the ≤8 logical ceiling.

The 790 cap was sized in *logical lookups*; eBay bills *attempts*. That is
the whole discrepancy — not duplicate queries, not extra pagination, not
fallback work.

Pagination is bounded and honest: `searchNewlyListed` loops `pages` times
and breaks early when a page returns fewer than `limitPerPage` items.
Requests that are sent but never answered draw a lease unit and are
deliberately *not* counted as a browse call, so the ledger's `used` is a
slight over-count of answered calls and an accurate count of **requests
sent** — which is what eBay meters.

**`unleased:` calls** appear in three windows only (`unleased:ingest-feed`
80 / 35, `unleased:refresh-deals:sweep` 22 / 15) and are **0 in the last
three**. There is no standing saving to take there, but the accounting hole
is real and should be closed so it cannot return.

## Finding at least 16 real calls/day of headroom

Ledger-cap movement is **not** a saving — in `off` mode a cap change alters
no external call. Only reducing work does. In the instructed priority order:

1. **Eliminate `unleased:` calls** — already 0/day. No standing saving.
2. **Remove duplicate / redundant work** — none found in the sweep:
   pagination is bounded and breaks early, and the graded lookups are
   already capped at 3/run (reduced from 6 in `alloc-rev2`).
3. **Reduce low-value calls — this is where the headroom is.** `ingest`
   spent **305** against a nominal cap of **40**, and its own documented
   yield is *"~382/day for ~4.5 first-time eligible pairs"* — on the order
   of **70–85 calls per useful outcome**, by far the worst ratio of any
   consumer. Bounding it to the 40 it is already budgeted for frees **265
   real calls/day**.
4. **Reduce useful US coverage** — *not required*, and not recommended.

### Exact before / after external-call arithmetic

| | calls/day |
|---|---|
| today (window ending 2026-09-24) | **4,988** |
| bound `ingest` to its existing 40 cap | −265 |
| subtotal | **4,723** |
| activate the priority lane (16 pairs) | +16 |
| **after** | **4,739** |
| headroom vs the external 5,000 limit | **261** |

This requires actually bounding the ingest job in code — not editing a
ledger number. Until that lands, the honest position is that there is **no
headroom** and the lane must stay off.

A second, larger lever exists if more is ever needed: reducing
`fetchWithRetry`'s blanket `retries = 1` on the highest-volume sweep path
would recover several hundred calls/day. It is not recommended without its
own canary — the retry exists for 5xx resilience, and removing it trades
quota for missed listings.

## Budget-enforcement migration plan (nothing enabled)

Enforcement must not be switched on globally. The ledger's own hypothetical
record shows what would have happened in the window ending 2026-09-24:

| consumer | used | cap | would grant | effect |
|---|---|---|---|---|
| `sweep:EBAY_US` | 1,091 | 790 | **81** | **93% truncated**, pace-denied on 64 of 68 requests |
| `ingest` | 305 | 40 | 40 | 87% truncated |
| `allocated:EBAY_DE` | 309 | 150 | 150 | 51% truncated |
| `allocated:EBAY_CA` | 529 | 435 | 435 | 18% truncated |
| `verify` | 440 | 450 | 85 | pace-denied 24, provider-denied 19 |
| `sealed` | 196 | 200 | 196 | unaffected |
| every other sweep country | under cap | — | ≥ used | unaffected |

Turning enforcement on today would cut the US sweep to ~7% of its current
work. The **pacing model, not the cap**, does the damage: a 96-runs-a-day
consumer is being paced as if it were continuous.

Proposed order, each step gated on the previous:

1. **Inventory every Browse consumer** — done above; `fetchWithRetry` is the
   single chokepoint, so the list is complete by construction.
2. **Identify every unleased caller** — `ingest-feed` and
   `refresh-deals:sweep` have both emitted unleased calls; both are at 0 now.
3. **Measure actual demand per consumer** — done above, six windows.
4. **Reconcile nominal caps with legitimate demand** — caps were sized in
   *logical lookups*; they must be re-sized in *attempts*, or the retry must
   stop drawing a second unit. Until that is fixed every cap is roughly 2×
   too small for the highest-volume consumers.
5. **Eliminate or lease the unleased traffic.**
6. **Simulate enforcement** — the `hypothetical` block already does this
   every window; use it rather than guessing.
7. **Identify what would be truncated** — table above.
8. **Canary enforcement on ONE low-risk consumer.** `sealed` is the obvious
   candidate: 196 used against a 200 cap with `wouldGrant` 196, so enforcing
   it changes nothing today while proving the machinery end to end.
9. **Verify no production regression.**
10. **Only then consider wider enforcement**, and only after step 4.

**Nothing in this plan has been executed.**

---

# Addendum — proof gaps closed (2026-09-24)

## Correction: production mode is OBSERVE, not `off`

The body of this document says `browseBudgetMode()` returns `off`. That
reading came from a local script against `.env.local`, which does not carry
`BROWSE_BUDGET_MODE`. The ledger rows are prefixed `browse_budget_observe:`,
which is authoritative: **production runs in observe**. The conclusions are
unchanged — in observe the caps are still non-binding — but the reason is
"observe grants the full ask", not "off skips the ledger".

## What actually provides the global daily cap

Not the attempt guard, which is invocation-local. The guarantee is a
**durable reservation under compare-and-set**:

1. `evaluateGrant` computes `capLeft = cap − used − sumOpen(key)`, so an
   **open, unsettled lease already removes capacity** from everyone else.
2. The reservation is written with `.eq("updated_at", prevVersion)` — a real
   CAS. A losing writer loops, re-reads and re-evaluates, so **the decision a
   caller receives always belongs to the iteration whose write won**.
3. An unsettled lease that expires is charged **in full**, never refunded.
4. In observe the lease reserves the full `want`, not the trimmed grant —
   conservative, and it is why a second concurrent invocation sees a negative
   `capLeft` and stands down.

Measured directly (cap 40, used 23, remainder 17):

| invocation | capLeft | ceiling | outcome |
|---|---|---|---|
| A | 17 | 17 | spends |
| B | −23 | 0 | skips |
| C | −63 | 0 | skips |
| | | **17** | **= the remainder exactly** |

## Verified rollback procedure for the sealed canary

My earlier claim — *"one env var, no deploy"* — **was wrong and is
withdrawn**. Vercel bakes environment values into a deployment, so editing
`SEALED_BROWSE_ENFORCE` in the dashboard does not reach an already-deployed
function; it needs a redeploy. I did not verify otherwise and will not
assert it.

**The verified immediate lever is Vercel Instant Rollback.** Confirmed from
the deployments API on 2026-09-24:

| deployment | commit | contains | state |
|---|---|---|---|
| `dpl_AvxdUvbmQJCDCZix9FSenruSdpWx` | `1bad152` | ingest bound **+ sealed canary** | current production |
| `dpl_AinciR3NJUhbKQ1oHe9xbvRAXggd` | `9123bbb` | ingest bound, **no canary** | `READY`, `isRollbackCandidate: true` |

Procedure, fastest first:

1. **Instant Rollback to `dpl_AinciR3NJUhbKQ1oHe9xbvRAXggd`** — promotes an
   existing build, no rebuild. Removes the sealed canary and keeps the
   ingest hard bound. This is the documented rollback.
2. Or set `SEALED_BROWSE_ENFORCE=off` **and redeploy** (`vercel redeploy`,
   or an empty commit). Slower: it requires a deployment.

The flag is still read inside the handler on every invocation, so whichever
value the *running* function has applies on its next run — that part is
real, and is all the flag guarantees.

## Production telemetry — ingest

From `catalog_snapshot / ingest_feed_runs`, window ending 2026-09-25T07:00Z:

| run (UTC) | code | logical queued | external attempts | note |
|---|---|---|---|---|
| 07:00 | pre-fix | — | 0 | |
| 08:01 | pre-fix | 40 | 40 | |
| 09:01 | pre-fix | 40 | 40 | |
| 10:01 | pre-fix | 20 | 20 | |
| 11:01 | pre-fix | 19 | 19 | **119 total, matching the ledger exactly** |
| **12:00** | **bounded** | — | **0** | `skipped: ingest_daily_attempt_limit`, `dailyLeft 0`, `limit 40` |

The bound fired on its first production run and made **zero** external
calls. The window was already 119/40 over when the fix deployed, so this
window cannot demonstrate the 40 ceiling — only that the stop works. The
first clean measurement is the window beginning **2026-09-25T07:00Z**.
