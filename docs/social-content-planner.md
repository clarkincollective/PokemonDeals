# Social Content Planner + Cadence Engine — Phase 13E.8A

A **deterministic planning layer** that decides WHAT content to create, FOR
WHICH platform, WITH WHICH goal, and WHEN — and stops there. It renders
nothing, calls no provider, makes no eBay call, and never mutates the
publishing ledger. A **plan is not an approval**.

```
real data (social:source)  ->  candidates  ->  score / tier / diversity
  ->  platform placements  ->  proposed cadence  ->  [ render -> QA -> approval -> Buffer ]
                                                     └── everything after this bracket is a LATER phase
```

Modules live in `lib/social/planner/`; the CLI is `npm run social:plan`.

Status labels: **[IMPLEMENTED]** · **[DESIGN ONLY]**.

---

## 1. Content families → goals  [IMPLEMENTED]

`lib/social/planner/families.mjs`. The **existing** four families (no new
visual system). The first goal listed is the family's DEFAULT (and matches
`lib/social/creativeSpec.CONTENT_GOAL_FOR`).

| family | valid goals | default |
|---|---|---|
| `deal_drop` | CONVERSION · REACH | CONVERSION |
| `market_mover` | ENGAGEMENT · TRUST | ENGAGEMENT |
| `hook_carousel` | REACH · ENGAGEMENT | REACH |
| `brand_ad` | BRAND · CONVERSION | BRAND |

Any other combination is invalid (`isValidCombo(family, goal) === false`).

---

## 2. Platform roles  [IMPLEMENTED]

`lib/social/planner/platformRoles.mjs`. Nothing goes to every platform.

| platform | role | carries |
|---|---|---|
| **Instagram** | polished visual brand | deal_drop, market_mover, hook_carousel, brand_ad |
| **TikTok** | short-form discovery / scroll-stop | deal_drop, market_mover, hook_carousel (motion cut, off by default) |
| **X** | immediate deal alerts + concise market observations + link traffic | deal_drop, market_mover (text-first — **no carousel**) |
| **YouTube Shorts** | evergreen / discoverable + educational-data hooks | deal_drop, market_mover, brand_ad |

---

## 3. Initial cadence  [IMPLEMENTED — CEILINGS, not quotas]

`CADENCE_CEILING_PER_DAY` (owner-timezone calendar day):

| platform | ceiling / day | notes |
|---|---|---|
| Instagram | **2** | feed / Reel; carousels selectively (`CAROUSEL_CEILING_PER_WEEK = 3`) |
| TikTok | **2** | |
| X | **4** | only where real content exists |
| YouTube Shorts | **1** | |

`BRAND_AD_CEILING_PER_WEEK = 2`. **If no good content exists, the planner
posts nothing** — no artificial filling (§21).

`social:plan -- today` from mid-afternoon has few windows left in the day;
real planning is usually `-- tomorrow` or `-- week`.

---

## 4. Weekly content mix  [IMPLEMENTED — ranges]

`lib/social/planner/contentMix.mjs`. The feed must not be 100% "another
discounted card".

By content **goal**: CONVERSION 30–45% · REACH 15–30% · ENGAGEMENT 15–30%
· TRUST 5–15% · BRAND 2–8%.
By **family**: deal_drop 35–45% · market_mover 20–30% · hook_carousel
15–25% · brand_ad 2–8%.

`goalMixCheck()` / `familyMixCheck()` return per-key
`{ count, share, target:[lo,hi], status }`; the planner emits a warning
when a share is `over`.

---

## 5. Candidate scoring model  [IMPLEMENTED — documented weights]

`lib/social/planner/scoring.mjs`. Every component is a **pure function of
real snapshot data** — no AI. Each is clamped 0..1; the weighted sum is
clamped 0..1. `SCORE_WEIGHTS` (sum = 1.00):

| component | weight | signal |
|---|---|---|
| `freshness` | 0.20 | deals: 1.0 at `exact_verified_at`, linear to 0 at the 6h social ceiling. movers/brand: flat 0.70 (truth is canonical history) |
| `discount_strength` | 0.18 | `discount_pct / 0.8` |
| `dollars_saved` | 0.13 | `log10(saved+1) / log10(1001)` |
| `card_popularity` | 0.10 | recognizable species (fixed table) → 0.95; short clean name → 0.55; else 0.35 |
| `visual_quality` | 0.10 | numeric `card_tcgplayer_id` (canonical art resolvable) → 1.0 (0.85 graded); else 0.35 |
| `market_confidence` | 0.12 | mover trend confidence (high/ok/low); deal reference validity |
| `printing_uniqueness` | 0.05 | real numeric tcgplayer id → 0.9 |
| `platform_fit` | 0.06 | family ∈ the target platform's role |
| `performance` | 0.06 | **§18 hook** — `perf.score` in −1..1 → 0..1; default 0.5 (neutral). Performance can influence SCORE only; human approval always required. |

`scoreBreakdown()` returns every component + the weighted contribution, so
the CLI prints "WHY SELECTED" and tests pin the formula.

---

## 6. Diversity guards  [IMPLEMENTED]

`lib/social/planner/diversity.mjs`. Prevents "Charizard, Pikachu,
Charizard, Pikachu all day."

- **HARD** (never overridable): the exact same stored deal id (never
  repeat); the same canonical card printing within 14 days. These reuse
  `lib/social/cooldown.COOLDOWN_WINDOW_HOURS` so the planner and the
  existing daily flow agree.
- **SOFT** (a score penalty, not an exclusion): species, set, family,
  goal, hook. `DIVERSITY_PENALTY` per recent occurrence (×min(n,3)), total
  capped at 0.30.
- **Exceptional override**: a candidate whose *raw* (pre-penalty) score is
  ≥ `EXCEPTIONAL_OVERRIDE_SCORE` (0.82) has its soft penalties waived —
  a genuinely exceptional deal is never dropped for diversity. The hard
  guards still apply.

---

## 7. Repetition windows  [IMPLEMENTED]

`REPETITION_WINDOWS_HOURS`:

| dimension | window | kind |
|---|---|---|
| exact deal id | ∞ | HARD |
| canonical card printing | 14 days | HARD |
| same Pokemon (species) | 3 days | SOFT |
| same set | 7 days | SOFT |
| same creative family | 18 h | SOFT (cadence-dependent) |
| same content goal | 12 h | SOFT |
| same hook variant | 24 h | SOFT |

---

## 8. Deal quality tiers  [IMPLEMENTED]

`lib/social/planner/tiers.mjs`. **Creative suitability only** —
`NOT_SOCIAL` does **not** mean the website deal is bad.

| tier | deal_drop signal | market_mover signal |
|---|---|---|
| **S_TIER** | discount ≥ 50% AND $ saved ≥ 100 AND recognizable AND canonical art AND confident | movement ≥ 35% AND high confidence AND recognizable |
| **A_TIER** | discount ≥ 30% AND (recognizable OR $ saved ≥ 60) AND art | movement ≥ 12% AND confidence ≥ 0.6 |
| **B_TIER** | valid + socially eligible, less scroll-stopping | valid movement, lower magnitude |
| **NOT_SOCIAL** | no canonical art, OR discount < 15%, OR not socially fresh | no canonical art, OR low-confidence trend (fail closed) |

`hook_carousel` grades on the count of distinct real cards (≥5 → A, ≥3 →
B, else NOT_SOCIAL). `brand_ad` is a steady B.

---

## 9. Market Mover quality  [IMPLEMENTED]

The **existing** `lib/social/priceMovement.resolveMovement` /
`confidentTrendWindows` gate is preserved unchanged: a mover needs real
price history, ≥ `MOVER_MIN_POINTS` observations, a confident trend
window, and real canonical card art. The planner never fabricates
"EXPLODING" — the snapshot carries the already-gated
`movement.{pct,direction,windowLabel,confidence}` and the planner grades
tiers on **movement magnitude + data confidence + recognizability**, not
discount.

---

## 10. Hook Carousel planning  [IMPLEMENTED]

Only when ≥ `SOCIAL_SPOTLIGHT_MIN_DEALS` (3) distinct truthful cards exist
(the snapshot's `carousel` block). No padding — if only 3 qualify, it is
a 3-card carousel. `item_count` is the real count.

---

## 11. Brand content frequency  [IMPLEMENTED]

`brand_ad` is comparatively rare: `BRAND_AD_CEILING_PER_WEEK = 2`, goal
BRAND, low intrinsic score (0.30). It supports TRUST / product
explanation / how-it-works — never "download our tool" daily.

---

## 12. Platform-specific selection  [IMPLEMENTED]

`lib/social/planner/placements.mjs` — `choosePlacements(cand)` picks
deliberately by tier + family, and only ever proposes a placement the
existing `FAMILY_DISTRIBUTION` eligibility table allows:

| candidate | placements |
|---|---|
| S-tier Deal Drop | Instagram Reel + TikTok + X + YouTube Short |
| A-tier Deal Drop | Instagram Reel + X + YouTube Short (skip TikTok) |
| B-tier Deal Drop | **X only** (mild deal) |
| S/A Market Mover | Instagram Reel + X + YouTube Short |
| B Market Mover | X only |
| Hook Carousel | Instagram carousel only (TikTok motion cut behind `CAROUSEL_TIKTOK_MOTION_CUT`, off) |
| Brand Ad | Instagram feed + YouTube Short |
| NOT_SOCIAL | nothing |

One `content_id` → several independent placement rows. Cross-platform
reuse is allowed; the same `(content_id, platform)` twice is blocked.

---

## 13. Time-of-day policy  [IMPLEMENTED — diversified TEST windows]

Not "statistically optimal" — there is no performance data yet.
`POSTING_WINDOWS_UTC_HOURS` are diversified test windows, **stored in
UTC**, chosen for a US-heavy audience with one AU-friendly slot:

| UTC | Brisbane | US-ET | intent |
|---|---|---|---|
| 13:00 | 23:00 | 09:00 | US morning |
| 17:00 | 03:00 | 13:00 | US midday |
| 21:00 | 07:00 | 17:00 | US afternoon |
| 00:00 | 10:00 | 20:00 | US evening / AU morning |

Instagram [21, 0] · TikTok [0, 17] · X [13, 17, 21, 0] · YouTube [17].
Every window count ≤ that platform's daily ceiling. The CLI displays each
time as UTC + Brisbane + US-ET.

---

## 14. No back-to-back spam  [IMPLEMENTED]

`MIN_SPACING_MINUTES` between two placements on the **same service**:
Instagram 240 · TikTok 240 · X 45 · YouTube 360. Different platforms may
share a clock time (the 13E.6A batch send-order layer staggers the actual
sends). The planner never schedules a burst of identical same-platform
posts.

---

## 15. Freshness vs scheduling  [IMPLEMENTED]

`lib/social/planner/freshness.mjs`. Deal content has a shelf life.

```
latest_safe_publish_at (deal_drop / hook_carousel)
  = exact_verified_at + SOCIAL_FRESHNESS_MAX_AGE_HOURS (6h) - PUBLISH_SAFETY_MARGIN_MINUTES (45m)

latest_safe_publish_at (market_mover)  = snapshot capture + 72h
latest_safe_publish_at (brand_ad)      = snapshot capture + 14d
```

A placement whose only available slot in the horizon is past
`latest_safe_publish_at` is **not scheduled** — it is reported under
"classified but not scheduled" with a `freshness:` reason. A candidate
with no `exact_verified_at` cannot be scheduled at all (needs
revalidation). Market Movers legitimately plan days ahead.

---

## 16. Planner CLI  [IMPLEMENTED]

```
npm run social:plan               # plan TODAY (writes PROPOSED plans)
npm run social:plan -- today
npm run social:plan -- tomorrow
npm run social:plan -- week        # next 7 days
npm run social:plan -- simulate    # 7-day DRY RUN from the committed fixture — writes NOTHING
npm run social:plan -- show        # print plans.json
  --from-fixture                   # use tests/fixtures/social-deals.json instead of the live snapshot
```

Per placement the output shows: WHEN (UTC + Brisbane + US-ET), PLATFORM
(+ placement media kind), CARD/subject, FAMILY, GOAL, QUALITY TIER, SCORE,
WHY SELECTED, FRESH UNTIL, CONTENT_ID — then PLATFORM VOLUME, GOAL MIX,
FAMILY MIX, UNFILLED SLOTS, CLASSIFIED BUT NOT SCHEDULED, WARNINGS.

Reads **only** local JSON (the frozen `social:source` snapshot + the local
`post-history.json`). No eBay call, no Buffer call, no render, no ledger
mutation.

---

## 17. Plan file  [IMPLEMENTED]

`lib/social/planner/plans.json` (committed `[]`, like
`distribution/ledger.json` / `batches.json`). States:
`PROPOSED → ACCEPTED | REJECTED | EXPIRED`. `expireStale()` marks a
PROPOSED plan whose `fresh_until_utc` has passed as EXPIRED.
`replaceProposed()` supersedes in-window proposals on a re-run and keeps
decided/expired plans as an audit trail.

**A PLAN IS NOT AN APPROVAL. An ACCEPTED plan does NOT become a published
job in this phase** — a human still runs the existing
`prepare-batch → review → approve-batch` flow.

---

## 18. Performance feedback  [DESIGN HOOK ONLY]

The planner is ready to ingest 13E.7A metrics (views / engagement / site
visits / affiliate outbound) as `cand.perf.score` (−1..1), which feeds
**only** the `performance` scoring component (weight 0.06). It never
controls publishing and never removes the human approval step.

---

## 19. Exploration vs exploitation  [DESIGN ONLY]

`contentMix.EXPLORATION_RESERVE` = 80% exploit / 20% explore. Reserved
weight for un-proven hooks / families / windows so the planner does not
over-fit one winning format. **Not enabled** as autonomous
experimentation.

---

## 20. Daily summary  [IMPLEMENTED]

`social:plan` prints an operator-friendly "TODAY'S RECOMMENDED CONTENT"
list, then per-platform volume, the goal/family mix vs target, and an
explicit **UNFILLED SLOTS** section ("Instagram carousel — no qualifying
content"). No artificial filling.

---

## 21. No content = a successful run  [IMPLEMENTED]

An empty snapshot, or a snapshot where every candidate is NOT_SOCIAL / on
cooldown / stale / capped, prints **`NO QUALIFYING CONTENT`** and exits 0.
No placeholder post, no stale fixture, no random brand filler.

---

## 22. First-week simulation  [IMPLEMENTED]

`npm run social:plan -- simulate` runs a 7-day plan from the committed
fixture (`tests/fixtures/social-deals.json`), labelled **SIMULATION ONLY
(fixture, not live)**, and writes nothing.

**Observed on the committed fixture** (4 movers, 7 distinct deals, no
carousel):

- **Family balance**: 8 Market Mover placements + 1 Brand Ad. Deal Drops:
  **0 scheduled** — every fixture deal was already past its
  `latest_safe_publish_at` at snapshot capture (the fixture was frozen ~5h
  after verification). This exercises the freshness gate (§15) correctly;
  a fresh `social:source -- live` snapshot carries several hours of runway
  and the mix rebalances toward Deal Drops.
- **Platform volume**: X 4 · YouTube 3 · Instagram 2 (all within ceilings).
- **Species repetition**: Ditto / Pikachu VMAX each appear on multiple
  platforms — but as ONE post each (distinct-content-id check), so no
  diversity warning fires. Cross-platform reuse, not repetition.
- **Set repetition**: none flagged.
- **Goal mix**: ENGAGEMENT 89% (over 15–30%), BRAND 11% (over 2–8%) —
  flagged, and explained by the deal-drop freshness expiry above.
- **Spacing**: every same-service pair respects `MIN_SPACING_MINUTES`.
- **Deal freshness expiry**: 7 deal candidates × 3–4 placements each
  reported under "classified but not scheduled" with a `freshness:` reason
  — the gate working.
- **Unfilled slots**: ~29 of ~38 week slots unfilled — reported, never
  padded.

---

## 23. Tests  [IMPLEMENTED]

`tests/scanner/social-planner-13e8a.test.mjs` (24): deterministic scoring
+ weights sum to 1; stronger deal outranks weaker; exact-print HARD
cooldown; species/set SOFT penalty; exceptional override; platform
eligibility; quality tiers (incl. NOT_SOCIAL ≠ bad site deal);
`latest_safe_publish_at` formula; stale deal cannot be planned; Market
Mover longer shelf life; no artificial filling; no-content clean run;
minimum spacing; cross-platform reuse allowed / same-platform duplicate
blocked; planner is pure and touches no Buffer / eBay / renderer /
publishing ledger.

---

## 24. What is NOT in this phase

- No render, no QA run, no Buffer call, no schedule, no publish.
- An ACCEPTED plan does not create a ledger row — the human runs
  `prepare-batch → review → approve-batch` as before.
- No autonomous experimentation; performance data influences SCORE only.
- The live-content dependency is unchanged: a real plan needs a fresh
  `social:source -- live` snapshot, which is still waiting on the eBay
  Browse quota recovery.
