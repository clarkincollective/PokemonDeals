# Social editorial newsroom (SOCIAL-NEWSROOM-1 / -2)

A deterministic editorial layer on top of the existing `lib/social` system.
It turns social from a reactive post generator into a planned newsroom that
can maintain a Buffer backlog days ahead **while reserving capacity for
fresh live Deal Drops**. It introduces **no** second planner, ledger,
Buffer client, QA engine, renderer, or source of truth.

**SOCIAL-NEWSROOM-1** built the model + gates (simulation only).
**SOCIAL-NEWSROOM-2** (this document's later sections) operationalises it:
DB persistence, idempotent story identity, a future-scheduled Buffer
backlog path through the existing adapter, an OpenAI visual reviewer
(Layer 5), feed-level QA, and a queueing circuit breaker.

Status: **build + persistence + gated scheduling.** Actual social
publishing stays OFF. Every Buffer request is a FUTURE-scheduled
draft/scheduled post (≥ now + 60 min) — never an immediate publish.
Social Stage 1 autonomy remains OFF (`RIGHTS_STATE.publishing = "DISABLED"`),
independent of the new `SOCIAL_BUFFER_BACKLOG_ENABLED` flag.

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

---

# SOCIAL-NEWSROOM-2 — persistent backlog + Buffer scheduling + Layer 5

## DB persistence (SS3, SS4, SS5, SS6)

`lib/social/newsroom/persist.mjs` builds the row shapes; `db.mjs` now
carries the editorial writes — `upsertStory`, `upsertPlacements`,
`patchPlacement`, `recordQaRun` — all idempotent (upsert on the primary
key; a repeated backlog build never duplicates a row), scoped to the 3
newsroom tables only (no write touches `deals`, the ledger JSON,
`hosted-assets.json`, `newsletter_subscribers`, `catalog_snapshot`, or
`digest_state`), and gated (no-op until the migration is applied).

Stable identity (`stableStoryId` / `stableCapturedAt`): the story id is
quantised by shelf-life class so rebuilds in the same window collapse to
one row — EVERGREEN one canonical story per (series, subject); EDITORIAL
per ISO week; SHORT per UTC day; LIVE per (series, subject,
`exact_verified_at`, deal id).

Frozen facts (`freezeFacts`): `facts_json` stores only an allow-listed set
of source-supported factual fields. Generated copy (caption/hook/CTA text)
is never persisted as source truth.

## Migration (SS2, SS48) - OWNER ACTION

This runtime has no DDL path (no `psql`, no `pg` client, no
`DATABASE_URL`, no `exec_sql` RPC), so the migration cannot be applied
from here. Owner:

1. Run `supabase/social_editorial_newsroom_migration.sql` in the Supabase
   SQL editor (idempotent - safe to re-run).
2. Verify with `npm run social:newsroom-migrate-check` (read-only: the 3
   tables + all expected columns + a non-destructive upsert/delete
   round-trip that leaves no row behind).

Until then every reader/writer no-ops and `social:backlog -- --build`
reports `MIGRATION_REQUIRED`.

## Backlog commands (SS23)

- `social:backlog` - dry-run: 14-day sim + review pack, no writes.
- `social:backlog -- --status` - backlog health per platform + refill need.
- `social:backlog -- --14d` / `--week` - horizon for the sim.
- `social:backlog -- --build` - persist calendar-placed editorial stories
  + placements + QA runs (needs the migration).
- `social:backlog -- --queue` - `--build` plus schedule QA-PASS placements
  into Buffer (needs the migration AND `SOCIAL_BUFFER_BACKLOG_ENABLED=true`
  AND a Buffer token AND a rendered+hosted artifact).
- `social:backlog -- --reconcile` - read-only: read Buffer state back for
  every queued placement; reports `MISSING_PROVIDER_POST` / `FAILED` /
  `PUBLISHED` / stale risk. Never resubmits.

## Buffer future-scheduling path (SS10, SS11, SS25)

`lib/newsroom/bufferBacklog.mjs` (outside `lib/social` because it touches
the provider adapter - same boundary as `lib/autonomous/socialPublish.mjs`).
It uses the existing `getSocialProvider()` adapter - no second Buffer
client. `scheduleOne()` rejects: LIVE/FRESH-lane stories; non-PASS
professional QA (WATCH holds, FAIL blocks); `scheduled_for <= now + 60m`
(`SCHEDULE_SAFETY_MINUTES`); a schedule after `latest_safe_publish_at`; a
placement with no hosted artifact. On provider ACCEPT the placement
becomes `BUFFER_QUEUED` with `buffer_provider_ref` + `scheduled_for` +
raw `provider_state` - never `PUBLISHED` (that needs `getPostStatus()`
sent-evidence).

Provider mode (`SOCIAL_BUFFER_BACKLOG_MODE`): `draft` (default - a Buffer
draft that never auto-sends) or `scheduled` (a real future auto-send).
Both map to `BUFFER_QUEUED` locally. Per-run ceilings:
`MAX_QUEUE_PER_RUN = 8`, `MAX_QUEUE_PER_PLATFORM_PER_RUN = 2`.

## `SOCIAL_BUFFER_BACKLOG_ENABLED` (SS11)

Default OFF. Independent of live autonomous publishing. Even `true`, it
never publishes immediately, never enables Stage 1, never flips
`RIGHTS_STATE.publishing`, and never schedules a LIVE Deal Drop.
`SOCIAL_BUFFER_BACKLOG_KILL=true` forces the posture OFF.

## Timezone (SS15)

`lib/social/newsroom/timezone.mjs` - owner is `Australia/Brisbane`
(UTC+10, no DST, fixed). Every schedule is stored `scheduled_for_utc`;
`scheduled_for_local` + `timezone` advisory. All conversions explicit
(`brisbaneWallToUtc` / `utcToBrisbaneLabel` / `normaliseSchedule`).

## Layer-5 visual review (SS17-SS21)

`lib/newsroom/visualReview.mjs` (outside `lib/social` - the preview-system
tests forbid a GenAI call there, the same reason `scripts/socialAssets.mjs`
owns the OpenAI image-gen call). `reviewRenderedCreative(image, context)`
calls OpenAI Chat Completions (`gpt-4o`, `response_format: json_object`)
with the actual final rendered PNG (a local file path or a `data:` URL - a
remote `http(s)` URL is refused, SS19; nothing else is sent). Returns the
SS18 rubric (`HOOK_CLARITY`, `CARD_DOMINANCE`, `FACT_HIERARCHY`,
`TYPOGRAPHY`, `SPACING`, `SAFE_ZONE_INTEGRITY`, `CTA_CLARITY`,
`BRAND_CONSISTENCY`, `THUMBNAIL_READABILITY`, `PREMIUM_FEEL`,
`EDITORIAL_VALUE`, `AI_SPAM_RISK`) + verdict + blockers[] + notes[].
Cache (SS21) keyed by `sha256` of the image bytes
(`.social-preview/editorial-newsroom/visual-review-cache.json`).
Fallback (SS20): no key / error / unparseable -> `verdict: "WATCH"`, never
auto-PASS. Verified against a real rendered creative (all 12 scores,
verdict PASS, `AI_SPAM_RISK: 40`).

## Feed-level review (SS33, SS34)

`lib/social/newsroom/feedReview.mjs` - deterministic checks over the next
~12 planned posts as a sequence (same-layout / same-species /
same-hook-grammar / price-card / commercial / red-accent /
identical-CTA-placement / branding share) ->
`FEED_PASS` / `FEED_WATCH` / `FEED_FAIL`. A repetitive feed of
near-identical price cards fails even when each post passes alone.

## Quality gate to reach Buffer (SS22)

Scheduled only when all pass: fact QA, rights/image QA, deterministic
creative QA, originality, sequence, caption similarity, and the
professional visual review. `WATCH` holds; `FAIL` blocks. Without a
rendered+hosted artifact the visual review cannot run -> the placement
stays `WATCH` (held) - fail-closed.

## Circuit breaker (SS39)

`lib/social/newsroom/backlogCircuit.mjs` reuses the pure circuit
primitives from `lib/autonomous/runState.mjs` (no new breaker) with its
own `backlog` surface. Trips -> `BACKLOG_SUSPENDED` after 3 qualifying
failures / 24h (provider scheduling, visual-review system failure,
provider auth, DB integrity). Owner-resume only.

## Structured events (SS41) + attribution (SS42) + stale (SS29)

`events.mjs` emits `STORY_CREATED` / `PLACEMENT_PLANNED` /
`QA_PASS|WATCH|FAIL` / `ASSET_HOSTED` / `BUFFER_QUEUE_REQUEST` /
`BUFFER_QUEUED` / `BUFFER_RECONCILED` / `BUFFER_DRIFT` / `STORY_EXPIRED` /
`QUEUED_CONTENT_STALE` / `BACKLOG_SUSPENDED` / `FEED_REVIEW`, every field
scrubbed of secret-looking values. Scheduled placements use the existing
deterministic UTM scheme (`attributedCtaUrl`) - no second attribution
model. `queuedContentStale()` flags a `BUFFER_QUEUED` placement whose
story `valid_until` has passed or precedes its scheduled time.

## Not activated (SS37, SS45)

The 2x/week refill cron (Sun/Wed) is designed, not wired. A read-only
daily backlog-health check is safe to activate later (no mutation). Both
wait until the migration is applied and a clean proof queue has run.

---

# SOCIAL-NEWSROOM-2C - real render -> host -> visual QA -> safe Buffer proof

## The creative path (now complete)

`persisted story -> platform placement -> REAL render -> REAL hosted asset
-> deterministic QA -> OpenAI Layer-5 -> feed review -> BUFFER_READY ->
future-scheduled Buffer proof -> reconciliation`

- **Render** - `lib/social/newsroom/editorialTemplates.mjs`: 5 deterministic
  editorial layout families with MATERIALLY different structure -
  `editorial_dashboard` (stat grid), `data_ranking` (ranked deltas),
  `story_reveal` (quoted frame), `process_explainer` (numbered steps),
  `trust_editorial` (masthead statement). Pure HTML, embedded fonts, NO
  card artwork / seller image / OpenAI redraw. 4:5 (IG/X) + 9:16
  (YouTube). Rasterised by the EXISTING `lib/social/render` (system Chrome
  over CDP) - no new renderer.
- **Series -> renderer** - `renderRegistry.mjs` maps each renderable
  series to one layout family + a deterministic content-prop builder from
  the persisted `facts_json`, plus `newsroomRights()` (matches the live
  `RIGHTS_STATE` exactly so `canHost`'s drift guard passes). TikTok is
  motion-only -> never a static placement; YouTube only when the series is
  materially varied (SS40).
- **Host** - the EXISTING `getStorageProvider()` (Supabase `social-public`
  bucket) + `hosted-assets` registry. Content-addressed immutable key
  (`by-hash/<sha256>.png`); a matching hash is never re-uploaded; the
  public URL is HEAD-verified.
- **Deterministic QA** - `editorialQa.editorialCreativeQa` (hook <= 3
  lines, one wordmark, 0-1 CTA, min 22px, safe zones, stat density, no
  duplicate stat). `qaStack` routes `creativeMeta.editorial` here instead
  of the deal-density `scoreCreative`.
- **Layer-5** - `lib/newsroom/visualReview.reviewRenderedCreative` on the
  ACTUAL PNG, `temperature: 0` (stable verdict at the margin). Editorial
  context in the prompt: a deliberately card-free composition is not
  penalised for CARD_DOMINANCE, and a NONE/BRAND_ONLY CTA is not flagged.
- **Feed review** - `feedReview` over the curated proof subset must be
  `FEED_PASS` before any queue (SS13). Each layout carries a distinct
  wordmark/CTA zone (`LAYOUT_CTA_ZONE`) so "identical CTA placement" is
  not tripped.

`npm run social:backlog-render -- --proof-seed` persists a fixed 5-series
proof set; `-- --render` runs the pipeline and patches PASS placements to
`BUFFER_READY`; `-- --queue-proof` does the Buffer proof (below).

## The Buffer proof (draft mode)

`SOCIAL_BUFFER_BACKLOG_ENABLED=true node scripts/socialBacklogRender.mjs
--queue-proof` - via the EXISTING adapter (`getSocialProvider().createPost`).

- **DRAFT mode** (`SOCIAL_BUFFER_BACKLOG_MODE` unset). A Buffer draft with
  a future `dueAt`: a REAL provider write that **never auto-publishes**.
  `getPostStatus` reports `status: "draft"`, `published: false`. To get a
  genuine auto-delivering scheduled post, set
  `SOCIAL_BUFFER_BACKLOG_MODE=scheduled` (adapter sends
  `mode: "customScheduled"`, no `saveToDraft` -> `status: "scheduled"`,
  auto-sends at `dueAt`).
- Every request: future `dueAt` (>= now + 60m), a resolved channel, a
  hosted asset, QA PASS + Layer-5 PASS, FEED_PASS, not stale, not a
  duplicate (a placement with a `buffer_provider_ref` is never re-queued).
- Times are Brisbane wall-clock converted explicitly to UTC
  (`brisbaneWallToUtc` / `normaliseSchedule`).
- Provider acceptance -> `BUFFER_QUEUED` (never `PUBLISHED`).
- Immediate `reconcileOne()` read-back after each queue.

**Instagram via Buffer** returns `InvalidInputError` for our editorial
image posts (a known Buffer-IG API constraint). The proof therefore runs
on **X**, which accepts the text+image post cleanly. Only MARKET pillar
series get an X placement (the platform role carries `market_mover`), so
the X proof set is `BIGGEST_MOVERS` + `MARKET_SNAPSHOT` - 2 distinct
series, 2 distinct layouts.

## Impeccable / Claude review (SS14)

`npm run social:quality-audit` now folds in the ACTUAL rendered proof
assets (`real_proof_renders`) alongside the representative specs, graded
on SCROLL_STOP / ORGANIC_VALUE / PREMIUM_FEEL / EDITORIAL_VALUE /
TYPOGRAPHY / LAYOUT / MOBILE_READABILITY / PLATFORM_FIT /
AI_SPAM_APPEARANCE.

## Not activated (SS25, SS45)

No Sunday/Wednesday mutation cron, no automatic refill, no 7-14 day
population. `SOCIAL_BUFFER_BACKLOG_ENABLED` is passed inline for the proof
only - it is not set in the environment.

---

# SOCIAL-NEWSROOM-2D - gate integrity + platform coverage + scheduled mode

## Gate integrity (the 2C WATCH-to-Buffer contradiction)

**Investigated:** the queued `BIGGEST_MOVERS` draft (`6a9f33371e39f0564cdb49a7`)
was Layer-5 **PASS at queue time** (21:52 render), but a later re-render of
the identical artifact verdicted **WATCH** (21:54) - and the queue path had
(a) hardcoded `professionalResult: "PASS"` instead of reading the persisted
verdict, and (b) no downgrade path, so a now-invalid placement kept a live
draft. **Not a hard bypass, but a real P0 integrity gap.**

**Fixes:**
- `db.artifactQueueEligible({ placementId, artifactSha })` - the queue path
  now reads the **latest STACK + latest LAYER-5 verdict FOR THE EXACT
  artifact sha**, both must be `PASS`. Every `social_qa_runs` row now
  carries `detail.artifact_sha256`; a run without it can only BLOCK.
- `preflightPlacement` / `scheduleOne` take an `artifactQa` arg and HARD-
  block unless `artifactQa.ok === true` - `createPost` is unreachable
  otherwise.
- the render pass DOWNGRADES a `BUFFER_READY` / `BUFFER_QUEUED` placement
  to `QA_WATCH` if a re-render no longer PASSes, and (for a not-yet-sent
  draft/scheduled post) calls `deletePost` + clears the local ref.
- Buffer adapter gained `deletePost(id)` (union `DeletePostSuccess |
  VoidMutationError`, verified live) - refuses a sent post; operator
  command `social:backlog-render -- --cancel-draft <ref>`.
- **Invalid draft `6a9f33371e39f0564cdb49a7` deleted from Buffer.** The
  `MARKET_SNAPSHOT` draft was PASS-valid at the time but its story was
  later re-seeded; all earlier proof drafts were cleaned up.
- **`--proof-seed` bug fixed:** a full `upsertPlacements` was replacing the
  row and nulling `buffer_provider_ref` / `scheduled_for` / `status` on an
  already-queued placement (this orphaned real Buffer posts once). It now
  preserves provider/schedule/QA state for any placement past `PLANNED`.

## Layout reliability (temperature:0 stability run, 6 samples each)

| layout | Layer-5 PASS rate | autonomous-safe |
|---|---|---|
| `editorial_dashboard` | ~100% (occasional WATCH on re-run) | **yes** |
| `trust_editorial` | ~100% (occasional WATCH) | **yes** |
| `process_explainer` | 100% | **yes** |
| `compare_split` (NEW) | 83-100% | **yes** |
| `story_reveal` | 50% | **no** (flaky) |
| `data_ranking` | WATCH-prone even after a bounded redesign | **no** |

`data_ranking` was redesigned (lead-mover hero + up/down split) and still
verdicts WATCH with no blockers - **replaced** for autonomous use by the
new `compare_split` (a two-column A-vs-B education layout). `AUTONOMOUS_SAFE_LAYOUTS`
= `editorial_dashboard, trust_editorial, process_explainer, compare_split`.
**Finding:** gpt-4o is NOT fully deterministic at `temperature:0` - the
gate is correctly fail-closed (WATCH holds) so autonomous throughput is
best-effort per cycle, never forced.

## Platform support matrix

| | Instagram | X | YouTube | TikTok |
|---|---|---|---|---|
| editorial status | **SUPPORTED** (single static `post` - NOT `carousel`; verified real draft) | **SUPPORTED** (text+image; families widened) | SUPPORTED_WITH_LIMITATIONS (9:16 Layer-5 flakier; narrative/editorial/evergreen only, `short:false` series excluded) | **NOT_PLATFORM_FIT** (motion-only; no editorial motion renderer wired) |

**Instagram InvalidInputError root cause:** the newsroom placement type
was `carousel`, so `metadata.instagram.type = "carousel"` - and Buffer
rejects a 1-asset carousel. Fixed: editorial IG placements are `post`
(a raw `createPost` with `type: "post"` succeeds).

**X coverage widened:** `xAllowed` now also accepts EDUCATION / STORY /
BEHIND_THE_FINDER series and a small BRAND allow-list (`METHODOLOGY`,
`PRODUCT_EXPLAINER`). Newsroom X/YouTube fit is decided by
`xAllowed`/`youtubeAllowed`, not the deal-creative `PLATFORM_ROLES` table.
An X caption is blocked only for a real near-duplicate (token/shingle
Jaccard >= 0.72 same-platform) or a repeated **numeric template** - a
pure-prose structural coincidence no longer false-blocks.

## Scheduled-mode proof (SS21-SS24)

`SOCIAL_BUFFER_BACKLOG_MODE=scheduled` - genuine future auto-delivery
(`mode: customScheduled`, no `saveToDraft` -> `status: "scheduled"`).
Curation caps **1 per platform** in scheduled mode; every gate
(artifact-QA invariant, FEED_PASS, `dueAt >= now + 60m`, future-only,
autonomous-safe layout, distinct series) enforced. Slots are **3-4 days
out** so the owner reviews in Buffer before delivery.

Two scheduled posts retained for owner review:

| series / layout | platform | provider_ref | Brisbane | UTC | provider state |
|---|---|---|---|---|---|
| MARKET_SNAPSHOT / editorial_dashboard | Instagram | `6a9f498d5b3dd39bb39eb30a` | 2026-09-11 10:00 | 2026-09-11T00:00:00Z | **scheduled** (published:false, drift:null) |
| WHY_SOLD_PRICES_MATTER / compare_split | X | `6a9f49904c4e8f291175ccec` | 2026-09-11 16:00 | 2026-09-11T06:00:00Z | **scheduled** (published:false, drift:null) |

Reconcile: `RECONCILED`, 2 queued, `published_detected: 0`.

## Recurring refill (SS25) - PREPARED, NOT ACTIVATED

`lib/social/newsroom/refill.planRefill()` - Sun+Wed cadence (`0 20 * * 0,3`,
**not** in `vercel.json`). Refills only below-target platforms, only
autonomous-safe + data-supported series, caps at the LOW watermark (no
overfill), returns `BACKLOG_LOW_BUT_NO_QUALITY_CONTENT` rather than filler,
and reports a `NOT_PLATFORM_FIT` / `PROVIDER_BLOCKED` platform as `BLOCKED`
(no refill loop).

---

## SOCIAL-CREATIVE-3 — hobby-native visual quality upgrade

Full detail: `docs/social-creative-hobby-native.md` (benchmark checklist,
per-category rules, series classification) and `docs/social-creative-motion.md`
(motion storyboard, design-only).

**Why:** the first real scheduled proof posts were technically valid but
visually underpowered (empty black fields, weak thumbnail impact, almost no
real card imagery, a generic finance/SaaS-infographic feel). The bar was
raised before any recurring automation.

**§0 — the two scheduled proof posts were cancelled** (already absent from
Buffer; local placements `plc_304e6499efe8` / `plc_a0c66a5672a7` reconciled
to `BUFFER_READY`, `buffer_provider_ref: null`, `provider_state:
CANCELLED_CREATIVE_BAR`, audit qa_run recorded). No PUBLISHED marker, no
replacements. The "Scheduled-mode proof" table above is historical.

**New:**
- `lib/social/newsroom/marketData.mjs` — real-data resolvers for the
  card-forward layouts. Each returns `{ok:true,…}` or
  `{ok:false, reason:"VISUALLY_UNDERPOWERED_DATA"}` — a story is WITHHELD,
  never rendered with placeholder numbers (SS22). Movers delegate to the
  sanctioned `lib/social/priceMovement` confidence gate — no direct
  `price_history` access.
- `lib/social/newsroom/cardEditorialTemplates.mjs` — six card-forward
  families (`deal_hero`, `bid_vs_total`, `asking_vs_sold`,
  `printing_compare`, `market_shape`, `three_up`). Real canonical TCGplayer
  art is the hero via `lib/social/cardArtwork` (file:// only — no AI
  redraw, no seller photo, no remote URL). Fixed a latent bug: `TOKENS.type.*`
  are objects, so every `${T.label}px` was rendering `[object Object]px`
  (browser-default 16px) — flattened to a scalar `S` map.
- `lib/social/newsroom/collectibleAppeal.mjs` — deterministic SS17 gate
  (card art present for every shown id, hero ≥ 28%, ≥ 2 real numeric
  callouts, price contrast, not generic-typographic). **Now a required
  layer in `qaStack.runQaStack` (`COLLECTIBLE_APPEAL`)** for card-specific
  data families.
- `lib/newsroom/visualReview.mjs` — Layer-5 rubric rewritten to the
  hobby-native dimensions (COLLECTIBLE_VISUAL_APPEAL, CARD_ART_USAGE,
  DATA_VISUAL_IMPACT, SCROLL_STOP_STRENGTH, HOBBY_NATIVE_FEEL,
  THUMBNAIL_STORY_CLARITY, VISUAL_SPECIFICITY,
  EMOTIONAL_COLLECTOR_RELEVANCE, AI_SPAM_RISK, …). "Technically clean but
  visually weak" → WATCH/FAIL, never PASS. `reviewRenderedCreativeMulti()`
  runs N samples (default 5) and takes the **worst case**.
- `lib/social/newsroom/cardLayoutStatus.mjs` — the single source of truth
  for the series classification and the autonomous-safe set.
- `scripts/socialCreativePack.mjs` (`npm run social:creative-pack`) — real
  data + real art → render → deterministic QA + COLLECTIBLE_APPEAL +
  5-sample worst-case Layer-5 → `feed-grid.html`, `previews.html`
  (thumb / 25% / mobile), `creative-pack.json` (per-asset scorecard).
  Nothing published, scheduled, hosted, or sent to Buffer.

**Classification (2026-09-08 real review pack):**

| Grade | Series | Autonomous-safe |
|---|---|---|
| VISUALLY_STRONG_NOW | MARKET_SNAPSHOT (market_shape), WHY_SOLD_PRICES_MATTER (asking_vs_sold), EXACT_PRINTING_MATTERS (printing_compare) | ✅ |
| VISUALLY_STRONG_WITH_REDESIGN | AUCTION_BID_VS_TOTAL (bid_vs_total), DEAL_DROP (deal_hero), THREE_UNDER_25 (three_up) | ❌ manual review only |
| DATA_NOT_READY | BIGGEST_MOVERS | ❌ withheld |

**Readiness:** 3 card-forward families are cleared for manual-review
scheduling. **NEWSROOM-3 autonomous refill stays blocked** — the target is
≥ 5 autonomous-safe families covering market + education + process/story +
multi-card + deal; the deal floor (`deal_hero`) and process/story
(`bid_vs_total`) are still manual-only. Stage 1 OFF, `RIGHTS_STATE.publishing`
DISABLED, `SOCIAL_BUFFER_BACKLOG_ENABLED` unset.
