# Graded inventory growth — proposal package (queued, NOT activated)

Prepared 2026-09-14, closing out the graded-category browsing pilot
review. **Nothing in this document is activated by writing it** — no
budget change, matcher change, watchlist change, or cron/schedule change
happens as a result. It is queued for a future, separate owner decision,
per the explicit instruction that closed this review: propose a bounded
expansion with costs and success measures, do not activate it.

This is scoped specifically to **graded inventory discovery** — a
question the existing `docs/ebay-quota-increase-request.md` (prepared
2026-09-10, also unsubmitted) does not address; that document is about
overall Browse-quota headroom across every job. This proposal builds on
top of it rather than duplicating it — see §4.

---

## 1. How graded inventory is actually discovered today

The scanner does **not** run a dedicated "search for graded cards"
strategy. Confirmed by reading the live pipeline (`lib/scanAllocator.js`,
`lib/ebay.js`, `lib/dealMatching.js`):

1. `lib/scanAllocator.js`'s `allocateScanTargets` picks which **cards**
   (from the shared watchlist) get an eBay Browse keyword search in a
   given marketplace, this run — a per-(card, marketplace) priority
   queue (hot / explore / exploit lanes) with no grading dimension in it
   at all. It decides *which cards*, not *which grades*.
2. eBay's Browse **search** response does not include grading data at
   all — no grader, no grade. Confirmed in `lib/ebay.js`'s own comment
   on `getGradingDetails`: *"Grader + grade ... aren't in search results
   - only the single-item endpoint returns them."* Reading that data
   costs one **additional** Browse-quota call per listing checked.
3. To avoid spending that extra call on every single search result,
   `lib/dealMatching.js` runs a title-text heuristic first
   (`GRADED_CARD_PATTERN` / the tiered `SLAB_GRADERS_STRONG` /
   `SLAB_GRADERS_WEAK` / glued-number / ACE-TAG detectors) — only a
   listing whose *title* looks graded gets the follow-up
   `getGradingDetails` call. Anything the heuristic doesn't flag is
   simply never checked and defaults to raw.

So graded supply is the product of three independent bottlenecks: how
often a card is searched at all (allocator budget/cadence), whether a
genuinely-graded listing's title trips the text heuristic, and whether
the follow-up detail call then confirms a recognized grader. This
review's inventory-funnel diagnosis (see the phase ledger entry)
separately confirmed the **display** gates are not a bottleneck at all —
every currently-active graded row already passes `isDisplayableDeal`
with zero disqualifications. The constraint sits entirely upstream, in
discovery.

## 2. Why stored rows go inactive

`is_active=false` is written by `app/api/verify-deals/route.js`, which
periodically re-checks every active row via eBay's single-item lookup
and retires it on a confirmed **SOLD** (item-level quantity exhausted)
or **ENDED** (404/410 — removed, or not offered in that marketplace),
or via `lib/auctionPricing.js`'s separate "retire" outcome when a live
auction's price falls below its publish floor. This is expected listing
churn, not a defect: 643 historical graded rows vs. 17 currently active
mostly reflects normal turnover (items selling or listings ending) over
time, not data loss.

## 3. Current scan allocation and available budget (measured, not modeled)

A **read-only** quota report (`npm run ebay:quota-report`, zero eBay
calls itself — one Supabase read of `ebay_job_runs`) run for this
review, 2026-09-13 UTC:

- **5,000 calls/day** total Browse quota (the account's current tier).
- **4,608** calls already logged by the time of this check; **11**
  calls already skipped for hitting the cap that day, **83** skipped for
  other rate-limit reasons; projected end-of-day total **~5,453** — i.e.
  the pipeline was already at or over its daily ceiling on an ordinary
  day, not a special one.
- **733** of those calls were specifically `getGradingDetails`
  follow-ups (the graded-confirmation step in §1) — a meaningful slice
  of the existing budget already goes to graded confirmation, not zero.
- Allocator sizing (`lib/scanAllocator.js`): ~125 base search targets
  per run × a marketplace weight (US 1.6, GB 1.2, AU/CA 1.05, DE 0.95,
  IT 0.9), capped at 380/run, 40/run exploration floor, split 16%
  hot-reserve / 62% explore / remainder exploit. This governs which
  *cards* get scanned; grading discovery rides on top of it, uncounted
  as its own dimension.

## 4. Relationship to the existing, separate quota-increase request

`docs/ebay-quota-increase-request.md` (prepared 2026-09-10, still
unsubmitted per its own text) is a **general** Browse-quota increase
request (5,000 → 10,000/day recommended), covering every job, not
graded discovery specifically. Two things worth noting for whoever next
opens that document, without editing it as part of this closure:

- Its §9 telemetry placeholders ask for measured (not modeled) daily
  call volume after 7–14 days of production data. This review's
  single-day read (§3 above: ~5,453 projected) is one real data point
  toward that, not the full 7–14-day average it asks for — flagged here
  as a pointer, not filled in there.
- If that request is ever submitted and approved, it directly loosens
  the hard ceiling this proposal's Option A (below) works around by
  reallocating *within* the existing budget. The two are complementary,
  not alternatives: a higher ceiling would make Option A's redistribution
  unnecessary, but doesn't reduce the value of Option B (a
  matching-accuracy question, independent of budget).

## 5. Bounded expansion options (choose one, or neither — not decided here)

Because the existing budget is already saturated (§3), "just scan more"
is not a free lever without either the quota increase in §4 or a
reallocation of existing spend. Two low-risk, bounded options that need
**no additional API spend**:

### Option A — reallocate a slice of the existing explore lane toward graded-active cards

Dedicate a small, fixed slice of the allocator's existing 62% EXPLORE
ratio (e.g. 10–15% of it) to targets whose watchlist card has ever had a
recognized graded listing, re-running their search more frequently
within the **same total daily budget** — at the cost of marginally
slower long-tail rotation for cards that have never yielded a deal at
all.

- **Cost:** $0 additional API spend; a redistribution of the existing
  5,000/day ceiling only.
- **Risk:** slightly slower first-discovery of raw deals on
  never-before-scanned cards.
- **Success measure:** re-run the same read-only funnel diagnosis
  (`graded-funnel.mjs`, or a committed equivalent) weekly for 4 weeks;
  compare active graded row count, grouped-tile count, and
  grader/marketplace spread against this review's baseline (17 active,
  16 grouped, PSA 12 / CGC 5, 6 marketplaces represented, snapshot
  2026-09-14).

### Option B — measure the title-heuristic's miss rate before touching budget at all

Before reallocating anything, take a stratified sample of recently
RAW-classified listings for cards with known graded activity elsewhere,
and check whether any were graded listings the title heuristic missed
(a false negative in `mentionsSlabGrader`/`GRADED_CARD_PATTERN`). If the
miss rate is low, Option A is the right lever. If it's high, improving
the heuristic's pattern coverage is a **zero-marginal-API-cost**
correctness fix — more graded listings recognized from the exact same
searches already being run, no budget change required.

- **Cost:** engineering/analysis time only; no API spend.
- **Success measure:** a documented false-negative rate on the sample,
  and (if a matcher change ships) a measured before/after
  graded-classification rate on the same sample.

### Not proposed here

Requesting a higher eBay Browse quota tier is **not** re-proposed by
this document — it already exists, unsubmitted, as
`docs/ebay-quota-increase-request.md`, and submitting it is an external,
account-level decision the ledger's own operational backlog already
holds as the owner's action, not something to initiate from this pilot
review.

---

**Status: queued for owner decision. Not activated. No code, budget,
watchlist, matcher, or schedule change has been made as a result of
this document.**
