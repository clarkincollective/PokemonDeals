# P0.4.3 — verify-deals BIN freshness / reverify allocation

## Symptom

`exact_verified_at` — the field that gates premium/flagship placement and
(halved to a 6h ceiling) social Deal Drop eligibility — was **never fresh for
a single Buy-It-Now row**. Measured live against production:

```
active BIN (displayable)      602
active AUCTION (displayable)   260
fresh BIN  ≤1h / ≤3h / ≤6h       0 / 0 / 0
fresh AUCTION ≤6h                20
strong BIN (≥30% off, canon art) 290 total → 0 fresh, 290 stale
BIN never verified              456
```

Social Deal Drop autonomy (`social:auto`) therefore always returned
`NO_CONTENT`: the only fresh-verified inventory was auctions, and that
pipeline is Buy-It-Now only.

## Root cause

`app/api/verify-deals/route.js` built its per-run batch with a single
`pool.sort(...)` whose `rank()` returned **0 for every active auction** and
2–4 for every fixed-price row, with **no reverify cooldown and no cap on how
often the same auction could be re-picked**. The cron runs every 30 min
(`*/30 * * * *`, `BATCH=20`) and re-sorted by `auction_end_at` each run. With
~260 active auctions there were always ≥20 at rank 0, so the batch was
**100% the 20 soonest-ending auctions, 48×/day** — BIN rows (rank 2–4) were
structurally unreachable.

## Fix — `lib/verifyAllocator.mjs` (pure, deterministic)

The route now delegates batch composition to `allocateVerifyBatch(...)`. It
changes **only which already-eligible rows get a Browse slot** — no
threshold, market-reference, qualification, cooldown-safety, or auction
re-price-path change.

1. **Critical auctions first** — anything ending within
   `AUCTION_CRITICAL_HOURS` (1.5h) is always taken, soonest-ending first.
   Its price is locking in; cooldown never applies.
2. **BIN freshness reserve** — a bounded slice (`BIN_RESERVE_FRACTION` =
   0.35 → 7 of 20) for displayable BIN rows with canonical art, discount
   ≥ `BIN_MIN_DISCOUNT` (0.15, the bar the tier model already uses), that
   are never-verified or aging past `BIN_AGING_HOURS` (3h = half the social
   ceiling). Ordered never-verified → oldest `exact_verified_at` → strongest
   discount. **Scales to 0** when `quotaRemaining - batch < reserve + 250`
   (auction safety wins on a tight day).
3. **General slots** — the preserved P0.2 `generalRank` / `generalTieBreak`
   (auction 0 → justAdded 1 → highValue 2 → midValue 3 → rest 4; justAdded
   ties on newest discovery), but auctions **not** ending soon get a
   time-to-end reverify **cooldown**
   (`auctionReverifyCooldownHours`: ≤12h→0.75h, ≤48h→3h, else→8h) so the ~20
   soonest-ending ones are no longer re-priced every single run.

`verifyHealthMetrics(rows)` exposes the freshness mix for the operator
dashboard ("Verifier freshness mix" panel, read-only).

## Result (24h simulation, real production pool, 48 runs)

| | OLD | NEW |
|---|---|---|
| Browse calls / day | 960 | **960** (unchanged) |
| fresh BIN ≤6h | 0 | **23** |
| strong BIN fresh ≤6h (social-eligible) | 0 | **6** |
| fresh AUCTION ≤6h | 20 | **20** (unchanged) |

Single-run batch mix moved from `bin 0 / auction 20` to
`bin 7 / auction 13` (`bin_subpool_size` 498, `auctions_skipped_cooldown`
20). No quota-floor change: the route's `RESERVE=800` guard and the
reserve's own 250-call headroom are both still enforced.

## Guardrails (unchanged)

- Social 6h freshness gate (`SOCIAL_FRESHNESS_MAX_AGE_HOURS`) — untouched.
- Deal qualification / `isDisplayableDeal` / thresholds / market reference —
  untouched.
- Auction re-price path (`repricedAuctionPatch` + `getListingSnapshot`) —
  untouched; below-floor recompute still RETIRED, never grandfathered.
- `social:auto` remains read-only w.r.t. eBay (0 Browse calls) and never
  triggers `verify-deals`.
- Nothing published.

See also `docs/p02-availability-incident.md`, `docs/ebay-rate-limits.md`.
