# Social editorial newsroom (SOCIAL-NEWSROOM-1)

A deterministic editorial layer on top of the existing `lib/social` system.
It turns social from a reactive post generator into a planned newsroom that
can maintain a Buffer backlog days ahead **while reserving capacity for
fresh live Deal Drops**. It introduces **no** second planner, ledger,
Buffer client, QA engine, renderer, or source of truth.

Status after this phase: **build + simulation only.** Nothing is published
or scheduled. No Buffer call, no Supabase write, no eBay Browse call.
Social Stage 1 autonomy remains OFF (`RIGHTS_STATE.publishing = "DISABLED"`).

## Architecture

```
DATA (read-only DB + resolveLiveSource)
  -> SUPPORT MATRIX          which series the data can truthfully support
  -> STORY OPPORTUNITIES     fresh lane (live) + planned lane (editorial)
  -> SCORING                 organic / originality / conversion-proxy
  -> QA STACK (5 layers)     fact / rights+image / creative / originality+sequence / visual-review
  -> MIN AUTONOMOUS QUALITY  no technically-valid low-value filler
  -> EDITORIAL CALENDAR      FIXED_EDITORIAL / RESERVED_FRESH / OPEN slots
  -> (owner) BUFFER BACKLOG  scheduled posts  [NOT wired in this phase]
  -> FRESH INSERTION         Deal Drops fill RESERVED_FRESH slots at runtime
  -> METRICS / LEARNING      reuses 13E.7A + the experiment framework
```

Modules: `lib/social/newsroom/` — `pillars`, `clocks`, `series`, `story`,
`placements`, `organicScore`, `conversionProxy`, `originalityScore`,
`ctaIntensity`, `captionSimilarity`, `sequenceGate`, `backlogHealth`,
`supportMatrix`, `fatigue`, `qaStack`, `calendar`, `visionReview`, `db`.

CLIs: `npm run social:backlog` (dry-run default), `npm run social:quality-audit`.

## Story model (§2)

A **STORY** is the platform-independent editorial idea (a series + a
subject + FROZEN facts). A **PLACEMENT** is that story presented natively
on one platform. One story → an Instagram carousel, a TikTok video, an X
post, a YouTube Short — the same facts, different platform-native
presentation, never literal copies (`CAPTION_STYLE` per platform).

`story_id` is `sha256(series::subjectType::subjectId::capturedAt::facts)` —
idempotent: re-deriving the same story from the same data yields the same id.

## Lifecycle (§4)

```
OPPORTUNITY -> PLANNED -> RENDERED -> QA_PASS -> HOSTED -> BUFFER_READY -> BUFFER_QUEUED -> PUBLISHED
failure/terminal: QA_WATCH  BLOCKED  EXPIRED  REJECTED  FAILED  CANCELLED
```

`canReachBuffer(state)` is `true` only for `HOSTED` / `BUFFER_READY`. A
`QA_WATCH` or `BLOCKED` story can **never** transition to `BUFFER_READY`
or `BUFFER_QUEUED`. Provider acceptance of a scheduled post =
`BUFFER_QUEUED`, **never** `PUBLISHED` (that needs sent evidence).

## Pillars (§5) and series (§6)

8 pillars: `DEALS COMPARISON MARKET BUDGET EDUCATION BEHIND_THE_FINDER
STORY BRAND`. Each maps to an operator balance bucket (`CONVERSION /
ORGANIC_GROWTH / AUTHORITY / BRAND`). 46 series in `SERIES_REGISTRY`, each
declaring its pillar, shelf-life class, CTA intensity, and **exactly which
factual fields it needs**.

## Data support matrix (§7)

`buildSupportMatrix(stats)` classifies every series as `SUPPORTED_NOW` /
`SUPPORTED_WITH_LIMITATIONS` / `DATA_NOT_READY` against a read-only stats
snapshot. A series whose required facts are absent produces **nothing** —
no fabricated numbers. `DATA_NOT_READY` today (needs data we don't persist
yet): `SAME_CARD_DIFFERENT_PRICES`, `RAW_VS_GRADED`, `GRADE_LADDER`,
`REGION_PRICE_GAP`, `PRICE_DROP`, `THREE_SELLERS_ONE_CARD`,
`CHEAPEST_WASNT_CHEAPEST`, `QUIET_CLIMBERS`, `SLABS_UNDER_X`, and other
multi-listing / graded-reference formats. Support is re-evaluated every
`social:backlog` run.

## The four content clocks (§8)

| class | horizon | examples |
|---|---|---|
| LIVE | 6h (the social freshness contract, **not relaxed**) | Deal Drop, New Listing, Price Drop |
| SHORT | 12–48h | 3 Under $25, Same Card Different Prices (frozen) |
| EDITORIAL | 3–14d | Market Snapshot, Weekly Winners, Set Watch |
| EVERGREEN | weeks/months | Raw vs Graded, explainers, methodology |

`shelfWindow()` returns `valid_from` / `valid_until` /
`latest_safe_publish_at`. LIVE content is pinned to
`exact_verified_at + SOCIAL_FRESHNESS_MAX_AGE_HOURS - PUBLISH_SAFETY_MARGIN`
— identical to the planner's `latestSafePublishAt` for deal families.

## Planned lane vs fresh lane (§9, §10)

`laneFor(class)`: `LIVE`/`SHORT` → **FRESH**, `EDITORIAL`/`EVERGREEN` →
**PLANNED**. The editorial calendar fills only PLANNED-lane stories into
`FIXED_EDITORIAL_SLOT`s. FRESH-lane stories (Deal Drops) fill
`RESERVED_FRESH_SLOT`s at runtime via the existing autonomous social path —
they never depend on stale scheduled content and make no eBay call.

## Backlog targets & reserved capacity (§9, §11, §33)

Depth targets (days, `[low, high]` watermarks): Instagram 7–10, TikTok
5–7, X 2–4, YouTube 10–14. Fresh-lane reserve fraction of each platform's
cadence ceiling: Instagram 30%, TikTok 30%, X 40%, YouTube 20%. Editorial
capacity = `floor(ceiling * (1 - reserve))`. Unused reserved capacity is
left **unused** — that is acceptable (§33).

Health states: `HEALTHY / WATCH / LOW / EMPTY / OVERFILLED`.
**OVERFILLED is a real bad state** — a 30-day queue is not better than a
10-day one.

## Scoring (§14, §15, §16)

- **Organic reach score** (`organicScore`) — 10 weighted deterministic
  components (hook strength, recognisability, novelty, curiosity, utility,
  save/share value, comment potential, visual potential, audience breadth).
  No engagement counts (there are none yet). Operationalises the §24
  human-feel test: `ORGANIC_MIN_FOR_BACKLOG = 0.55`.
- **Conversion** — the authoritative model is
  `lib/social/experiments/score.conversionScore(funnel)` (post-publish).
  Pre-publish there is no funnel, so `conversionProxy` scores the
  pre-publish factors the spec lists (price contrast, absolute saving,
  purchase intent, deal confidence, CTA relevance, destination relevance),
  explicitly `is_proxy: true`. Organic and conversion are **never merged**.
- **Editorial originality** (`originalityScore`) — 11 dimensions (series,
  pillar, Pokemon, printing, set, hook grammar, CTA intensity, layout,
  background, price band, numeric structure) each with its own window,
  scored across **published history + Buffer queue + planned backlog**,
  not just the current run. `ORIGINALITY_MIN_FOR_BACKLOG = 0.6`.

## Anti-AI-spam system (§17, §18, §35, §38)

- **Sequence gate** (`checkSequence` / `resequence`) — deterministic rules
  over the ordered per-platform calendar: max-consecutive + min-gap per
  dimension, plus rolling-window share ceilings. An `exceptional` item may
  override SOFT rules; the HARD "same printing" cooldown
  (`lib/social/planner/diversity.hardGuard`) is unchanged.
- **Caption similarity** (`captionDuplicateCheck`) — token Jaccard +
  3-gram Jaccard + a numeric-template **skeleton** match. Same-platform
  block ≥ 0.72; an identical skeleton blocks cross-platform (kills
  "$X CARD. LISTED FOR $Y" repeated with new numbers). Platform-native
  captions for one story are expected to differ.
- **CTA intensity** (`HARD / SOFT / BRAND_ONLY / NONE`) — `sequenceCtaCheck`
  caps HARD share ≤ 40%, commercial (HARD+SOFT) ≤ 65%, ≤ 2 HARD in a row.
- **Content fatigue** (`fatigueReport`) — 7-day share of series / pillar /
  species / layout / hook / commercial; warns past ceilings.

## QA layers (§22, §25)

| layer | what | engine |
|---|---|---|
| 1 FACT | frozen facts present + internally consistent | deterministic |
| 2 RIGHTS/IMAGE | own render only, rights cleared, no seller photo | deterministic |
| 3 CREATIVE | density / hierarchy / one CTA / legible | reuses `lib/social/creativeQa.scoreCreative` |
| 4 ORIGINALITY/SEQUENCE | originality ≥ min, sequence clean, caption not a dup | reuses newsroom scores |
| 5 VISUAL REVIEW | rendered-creative critique | **documented gap** (see below) |

`runQaStack` → `PASS / WATCH / FAIL`. Autonomous `BUFFER_READY` requires
`professional_result === "PASS"` **and** (`organic ≥ 0.55` **or**
`conversion ≥ 0.8`) **and** `originality ≥ 0.6` (`minimumAutonomousQuality`).

## OpenAI runtime review status (§22)

**Not cleanly supported — documented as a gap.** This repo has no OpenAI
vision/chat client; OpenAI is wired for **image generation only**
(`gpt-image-2`, sole caller `scripts/socialAssets.mjs`). In addition,
`tests/scanner/social-preview-system.test.mjs` forbids any GenAI provider
call inside `lib/social`. So `lib/social/newsroom/visionReview.mjs` is a
**no-network placeholder**: Layer 5 always resolves to `WATCH` (cannot
autonomously schedule) unless a verdict is supplied out-of-band. A future
sanctioned automated reviewer would live in `scripts/` next to
`socialAssets.mjs` (the existing OpenAI boundary), or reuse the Anthropic
vision pattern already in `lib/visualAuthenticity.js` (outside `lib/social`).

## Claude / Impeccable role (§23)

Claude / Impeccable is a **development-time** quality auditor — it does not
run inside Vercel production. `npm run social:quality-audit` builds a
representative review pack (`.social-preview/editorial-newsroom/quality-audit/`)
for a periodic human/Impeccable pass; feed P0/P1 findings back as
design-system fixes. The autonomous runtime uses the deterministic QA
stack + (when configured) an out-of-band visual-review verdict.

## Platform-specific strategy (§39–§43)

- **Instagram** — polished visual/editorial; carousels + Reels; restrained
  hashtag set; link in profile.
- **TikTok** — short hook-led discovery; narrative/motion.
- **X** — fresh alerts + concise useful commentary; 0–2 hashtags; **no
  duplicate/near-duplicate automated posts, no repeated bare links**
  (`xAllowed` + skeleton block).
- **YouTube** — evergreen/editorial Shorts with **material substance
  variation** (`youtubeAllowed`: narrative or EDITORIAL/EVERGREEN only — a
  bare card/price/percentage story gets no YouTube placement).
- **Hashtags** — restrained per-series/platform sets, no identical large
  blocks, no unrelated trending automation.

## Backlog refill (§30, §31, §32)

`refillNeeds(health)` returns the most-under platforms first and never
asks to fill an `OVERFILLED` one. If no story clears minimum autonomous
quality, the builder returns **no filler** (`BACKLOG_LOW_BUT_NO_QUALITY_CONTENT`
semantics) rather than generating low-value posts. A conservative
recurring builder (2×/week, e.g. Sun/Wed) is **designed but NOT activated**
in this phase.

## Buffer / local-DB truth (§27, §28, §29)

PokemonDealFinder DB = editorial + planning truth (`social_stories`,
`social_story_placements`, `social_qa_runs`). Buffer = delivery/schedule
provider only. A placement row points **at** the distribution ledger
(`content_id`), hosted assets (`artifact_hash`), and Buffer
(`buffer_provider_ref`) — it never duplicates their state.
`npm run social:backlog -- reconcile` is **read-only**: it reports
`MISSING_PROVIDER_POST / TIME_DRIFT / FAILED / QUEUED / PUBLISHED` and
**never resubmits**.

## Performance feedback (§36, §37)

Reuses 13E.7A metrics + `lib/social/experiments`. Performance may tilt
future ranking but full autonomous winner-exploitation is **not** enabled;
the experiment framework stays authoritative for formal A/B tests.

## Emergency stop

`RIGHTS_STATE.publishing = "DISABLED"` (code constant) fail-closes all
publishing. The autonomous kill switches (`SOCIAL_AUTONOMOUS_KILL`, the
distribution `gates.mjs` stack) are unchanged and still apply on top. The
newsroom writes nothing to Buffer or Supabase.

## Migration (§48)

`supabase/social_editorial_newsroom_migration.sql` — idempotent
(`create table if not exists` + `create index if not exists` +
`add column if not exists`). RLS enabled, zero policies = deny-all for
anon. **Owner action** — run it in the Supabase SQL editor when ready;
until then `lib/social/newsroom/db.tablesReady()` returns false and every
reader returns empty (nothing errors).

## 14-day simulation (§49)

`npm run social:backlog -- --14d` writes
`.social-preview/editorial-newsroom/{backlog-summary,calendar-14d,support-matrix}.json`.
The goal is **high-quality variety, not zero unfilled slots** — a calendar
with many `OPEN_SLOT`s and a handful of strong `FIXED_EDITORIAL_SLOT`s is
the intended output while the editorial data surface is still thin.
