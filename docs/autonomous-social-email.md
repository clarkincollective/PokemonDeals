# Autonomous Social + Email Orchestration — Phases AUTO-1 / AUTO-2

The layer that runs social posting and the email digest **without routine
owner approval** — while staying **fail-closed** and never publishing
weak / stale / fabricated content to satisfy cadence.

- **AUTO-1** built + dry-run-verified the decision layer.
- **AUTO-2** wired the live provider paths (Buffer / Resend), installed
  the Vercel crons, and staged the rollout. **Production autonomy is
  still OFF** — every AUTO flag defaults OFF, `RIGHTS_STATE.publishing`
  is `DISABLED` (a code-reviewed constant, not an env var), `DIGEST_SEND_
  ENABLED` is unset, and the CLIs default to dry-run. Enabling is a
  deliberate owner step (below).

---

## Architecture

Autonomy is a **thin orchestration layer over the existing systems** — it
re-implements nothing:

```
lib/autonomous/
  config.mjs      the 6 flags + posture resolution (kill beats everything)
  runState.mjs    durable run log + circuit breaker + digest send history
  socialAuto.mjs  pure decision logic: tier floor, first-live safety,
                  autonomous approval provenance, candidate selection,
                  stage cap, cadence, pre-send revalidation
  emailAuto.mjs   pure decision logic: per-deal safety, digest selection,
                  pre-send revalidation, audience contract, frequency cap,
                  fingerprint / duplicate protection

scripts/socialAuto.mjs   npm run social:auto   (composes the above + live source)
scripts/crmAuto.mjs      npm run crm:auto      (composes the above + live DB read)

app/api/social-auto/route.js   protected cron endpoint (inert in AUTO-1)
app/api/crm-auto/route.js      protected cron endpoint (inert in AUTO-1)
```

**Autonomy replaces ROUTINE HUMAN APPROVAL only.** Every factual /
compliance / freshness / QA / drift / duplicate / EPN gate in
`lib/social/distribution/gates.mjs`, `lib/social/distribution/revalidate.mjs`,
the 13E.6A batch checksum, and `app/api/send-digest` still runs and still
blocks. AUTO-1 files never import `gates.mjs` and never weaken it.

---

## Social flow (`npm run social:auto`)

```
1  RESOLVE a FRESH live source (AUTO-3)   resolveLiveSource() - the ONE canonical resolver,
                                           shared with `social:source -- live`. Reads current
                                           verified Supabase state (NO Browse call). NEVER a
                                           fixture / historical / stale / on-disk fallback.
                                           0 eligible -> NO CONTENT (successful). No manual
                                           `social:source` step is required.
2  select an autonomous candidate          stricter than the planner (see quality floor)
3  assign experiment                       13E.10A deterministic assignment (unchanged)
4  verify content tier                     S/A tier only for deal_drop; B never
5  render                                  existing renderer + creative QA
6  QA                                      existing QA gate (13E.11A)
7  host                                    Supabase Storage (13E.5C)
8  construct batch                         buildBatch() - freezes copy + artifact sha + facts + source
9  autonomous approval                     approval_type = AUTONOMOUS, approved_by = SYSTEM_AUTONOMOUS,
                                           approval_policy_version, frozen checksum (same as manual)
10 final revalidation                      13E.6A revalidate + factDrift + freshness_at_send
11 Buffer submission          <-- MUTATES  only in LIVE mode, circuit CLOSED, all gates green
12 sync status                <-- MUTATES  provider read; QUEUED != PUBLISHED
13 persist result                          run record (runs.json)
```

Steps 11-13 are **impossible in default dry-run** — the CLI never imports
the Buffer client and never calls `social:publish send-batch`. In AUTO-1
the provider submit is deliberately **not wired at all**: even a fully
green LIVE plan stops at step 10 and hands off to the existing 6-flag
`social:publish send-batch --confirm-live` owner step.

### Social quality floor (stricter than planner eligibility)

| family | autonomous rule |
|---|---|
| `deal_drop` | **S_TIER or A_TIER only**. B_TIER is never autonomously published initially. |
| `market_mover` | **high-confidence movements only** (confidence ≥ 0.9 / "high"). |
| `hook_carousel` | ≥ 3 truthful distinct cards + canonical art + strong QA. |
| `brand_ad` | rare — the existing ≤ 2 / week ceiling applies. |
| `NOT_SOCIAL` | never. |

### First-live deal safety (fail closed)

A deal-driven candidate is skipped unless ALL hold: `source_is_live=true`,
`exact_verified_at` present, freshness within the social ceiling, listing
active, current listed price + market reference + discount all present,
image integrity PASS, **no fixture source, no historical fallback, no
stale snapshot**.

### Pre-send revalidation (immediately before any Buffer call)

Re-runs `factDrift` + freshness + artifact-hash check:

| change | action |
|---|---|
| listed price changed at all | **SKIP** |
| market reference moved > 2% | **SKIP** |
| discount drifted > ~2 pts | **SKIP** |
| Market Mover movement > ~3 pts | **SKIP** |
| snapshot past the social freshness ceiling | **SKIP** |
| artifact hash ≠ the approved one | **SKIP** |
| listing ended | **CANCEL** |

SKIP → the item is not posted this run; a later run with a **fresh
render** may post it. Factual creative is **never auto-edited** after
approval.

### Cadence (planner ceilings — ceilings, not quotas)

Instagram 2/day · TikTok 2/day · X 4/day · YouTube 1/day · carousel ≤ 3/week
· brand ad ≤ 2/week (from `lib/social/planner/platformRoles.mjs`, unchanged).
**If nothing qualifies, NO CONTENT is a successful run.**

### Platform distribution

The planner chooses the platform subset from existing platform-fit rules
(a strong Deal Drop may become IG Reel + TikTok + X static + YouTube
Short). Platforms are independent — one platform failing validation does
not block the others → `PARTIAL_SUCCESS`. Successful posts are **never
rolled back**; a `FAILED` placement is not retried immediately (circuit /
retry policy governs a later safe retry).

### Experiment preservation (13E.10A)

Deterministic assignment only — the system **never picks the visually
preferred variant**. For the first Deal Drop sequence, E1 =
`PRICE_CONTRAST` vs `PERCENT_GAP`. The batch freezes `experiment_id`,
`variant_id`, `hook_variant`, `cta_variant` into the approval checksum;
any post-approval change invalidates it.

### Duplicate protection

`ledger.duplicateOf` (same content_id + platform + variant in QUEUED /
PUBLISHED) + the batch checksum + a card-printing cooldown. Retries
inspect `provider_ref` before doing anything — **no blind resubmission**.

---

## Email flow (`npm run crm:auto`)

```
1  fresh eligible deals        fetchDigestDeals (is_active + BIN-only, unchanged)
2  digest candidate            per-deal safety (§21); need >= 3, target 6, max 8
3  pre-send verification       revalidate every item vs fresh state; < 3 left -> CANCEL
4  render                      lib/crm/digestTemplate.renderDigest (website-first links, footer)
5  subscriber eligibility      status=ACTIVE AND confirmed=true AND unsubscribed_at IS NULL
6  Resend            <-- MUTATES  only LIVE + DIGEST_SEND_ENABLED + emailEnabled() + circuit CLOSED
7  send record                 digest send history (digests.json)
```

Step 6 is **impossible in default dry-run** — the CLI never imports
`lib/email` and never calls Resend. In AUTO-1 the Resend send is
deliberately not wired: a fully green plan records a `DRY_RUN` history
entry and stops.

### Email deal safety (§21) — every item, every time

`is_active=true`, BIN-only (the digest's own 13C.2.1 policy — **not
changed**), fresh enough, valid listed price + market reference +
positive discount, image integrity PASS, a usable deal id for the
website landing URL.

### Content bounds

Minimum **3** eligible strong deals. Target **6**. Maximum **8**. Fewer
than the minimum at selection **or** at pre-send re-check → **SKIP / CANCEL
the whole digest**. Never a weak 1-card email.

### Audience contract (§23) — hard

Included only: `status = ACTIVE` **and** `confirmed = true` **and**
`unsubscribed_at IS NULL`. Excluded always: `PENDING`, `UNSUBSCRIBED`,
`BOUNCED`, `COMPLAINED`.

### Duplicate digest safety (§25)

Every digest persists: `digest_id`, `fingerprint`
(`sha256(preset::subject::sorted-deal-ids)`), `created_at`, `sent_at`,
`provider_refs`, `recipient_count`, `deal_ids`, `status`. An identical
digest (same deal set) is never sent twice. If the provider result is
uncertain, the entry is `UNCERTAIN` and **no blind resend** happens.

### Unsubscribe / identity (§26)

Every autonomous email uses `renderDigest`, which always carries the
why-received line, the one-click unsubscribe link, the bare domain, and
the affiliate disclosure. The CRM-1 / CRM-1E unsubscribe contract is
**unchanged**.

### CRM capture stays independent (§29)

Subscriber signup / confirmation / unsubscribe are live regardless of
`EMAIL_AUTONOMOUS_ENABLED`. Turning email autonomy OFF does **not**
disable capture.

---

## Flags

Six independent, additive controls. **None overloads an existing publish
flag.** `SOCIAL_PUBLISH_ENABLED`, `SOCIAL_PUBLISH_DRY_RUN`,
`RIGHTS_STATE.publishing`, `SOCIAL_EPN_AI_CLASSIFICATION`,
`DIGEST_SEND_ENABLED` all still apply on top.

| flag | default | effect |
|---|---|---|
| `SOCIAL_AUTONOMOUS_ENABLED` | unset (false) | `"true"` → autonomous social MAY run live |
| `SOCIAL_AUTONOMOUS_KILL` | unset (false) | `"true"` → **HARD STOP**: no social mutation, ever |
| `SOCIAL_AUTONOMOUS_STAGE` | `STAGE_0` | rollout stage (see below) |
| `EMAIL_AUTONOMOUS_ENABLED` | unset (false) | `"true"` → autonomous digest MAY run live |
| `EMAIL_AUTONOMOUS_KILL` | unset (false) | `"true"` → **HARD STOP**: no digest send, ever |
| `EMAIL_AUTONOMOUS_STAGE` | `EMAIL_STAGE_0` | rollout stage (see below) |

**Kill beats everything.** If a kill switch is `"true"` the surface is
`SUSPENDED` regardless of ENABLED, STAGE, or a `--live` flag.

**Social and email are fully independent** — one enable flag never
affects the other surface.

`canMutateProviders` (the single boolean every mutation checks) is true
**only** when: `kill == false` **and** `enabled == true` **and** the
stage is a mutating stage **and** the caller explicitly requested live
**and** the circuit breaker is CLOSED.

---

## Rollout stages

### Social (`SOCIAL_AUTONOMOUS_STAGE`)

| stage | max **content items**/day | mutates providers |
|---|---|---|
| `STAGE_0` (default) | 0 | no — dry-run only |
| `STAGE_1` | 1 | yes |
| `STAGE_2` | 2 | yes |
| `STAGE_3` | ∞ (normal planner ceilings) | yes |

A **content item** = one `content_id`. Its IG / TikTok / X / YouTube cuts
count as **one** item toward the cap, not four.

### Email (`EMAIL_AUTONOMOUS_STAGE`)

| stage | max digests/week | mutates providers |
|---|---|---|
| `EMAIL_STAGE_0` (default) | 0 | no — dry-run only |
| `EMAIL_STAGE_1` | 1 | yes |
| `EMAIL_STAGE_2` | 2 | yes |

Normal ceiling after rollout: **≤ 2 marketing digests/week**. The persisted
send history — not the cron — enforces the cap.

---

## Circuit breakers

Durable, per surface (`.social-preview/autonomous/<surface>/circuit.json`).

- **Trip:** ≥ **3** mutation/provider failures within **24 h** → `AUTO_SUSPENDED`.
- When suspended: planner / dry-run / rendering may continue; **no Buffer
  or Resend mutation**.
- Cleared **only by an explicit owner resume** (`resumeCircuit`). A timer
  alone never clears a provider-failure trip.
- Email circuit also trips on: template failure, subscriber-query failure,
  and (where evidence is available) high bounce / complaint rate.

---

## Failure modes

| situation | outcome |
|---|---|
| no live source snapshot / fixture / stale | social run = **NO CONTENT** (success) |
| 0 candidates clear the quality floor | **NO CONTENT** (success) |
| drift at pre-send | **SKIP** (fresh render later) |
| listing ended at pre-send | **CANCEL** |
| one platform fails, others succeed | **PARTIAL_SUCCESS**; no rollback; no immediate retry |
| ≥ 3 mutation failures / 24 h | circuit **AUTO_SUSPENDED**; owner resume required |
| < 3 eligible digest deals | **SKIP DIGEST** |
| digest items drop below 3 at pre-send | **CANCEL** whole digest |
| 0 ACTIVE subscribers | **SKIP DIGEST** |
| weekly cap reached / identical fingerprint | **SKIP DIGEST** |
| scanner freshness starved | post nothing (never a forced Browse call) |

---

## Provider truth model (AUTO-2 wiring)

The live paths **reuse the existing adapters** — no second Buffer client,
no second email sender:

| step | reuses |
| --- | --- |
| social submit | `lib/autonomous/socialPublish.submitAutonomousBatch` → `revalidatePlacement` (13E.6A) → `getSocialProvider().createPost` → `applyProviderAccept` / `applyProviderReject` |
| email send | `lib/autonomous/emailSend.sendAutonomousDigest` → `renderDigest` (website-first, footer, `List-Unsubscribe` headers) → `lib/email.sendBatch` |

Social status transitions (unchanged): `createPost` accepted → ledger
**QUEUED** (+ `provider_ref`). **PUBLISHED** comes only from a later
`sync-batch` on real send evidence. Failure evidence → **FAILED** (never
auto-retried). A row that already has a `provider_ref` is **never
resubmitted** — retry inspects the ref first.

Email: `sendBatch` `{sent,failed}` → digest history entry `SENT` /
`PARTIAL` / `FAILED` / `UNCERTAIN`; an uncertain result is **not** blindly
re-sent.

## Cron architecture (INSTALLED in `vercel.json`, inert until flags set)

Endpoints verify every flag themselves — **cron presence alone cannot
enable autonomy** (`resolveLiveSocialGates` / `resolveLiveEmailGates`
re-check the AUTO flags, the 4 existing publish controls / `DIGEST_SEND_
ENABLED` + `emailEnabled()`, and the circuit). While flags are OFF they
return `{ ok:true, skipped:"autonomous_disabled" }` and touch no provider.

```json
{ "path": "/api/social-auto", "schedule": "0 * * * *" },   // hourly
{ "path": "/api/crm-auto",    "schedule": "0 16 * * 2" },   // Tue 16:00 UTC
{ "path": "/api/crm-auto",    "schedule": "0 16 * * 5" }    // Fri 16:00 UTC
```

- `GET /api/social-auto` — hourly EVALUATE. **AUTO-3:** it resolves a
  fresh live source from the DB itself (`resolveLiveSource`) — no manual
  `social:source` step. When LIVE + gates pass, it submits **the single
  oldest autonomous-approved, untampered batch** (one per invocation —
  the STAGE cap is enforced upstream). It does **not** render / QA / host
  — that stays a CLI / worker job (`npm run social:auto -- --once` on a
  machine that can commit ledger state; see the state-persistence note).
- `GET /api/crm-auto` — twice-weekly EVALUATE. "Cron fires" means
  *evaluate whether a digest should exist*, never *must send*. It runs
  the full decision → pre-send revalidation → audience → `sendBatch`.
  A **Supabase-persisted** `catalog_snapshot / digest_state` row (shared
  with `/api/send-digest`) enforces the ~6-day floor even across Vercel's
  ephemeral filesystem.

### State-persistence note

Autonomous **run state / circuit / social ledger / batches** are local
JSON files (`.social-preview/autonomous/*`, `lib/social/distribution/
{ledger,batches}.json`). On Vercel these are ephemeral. Therefore:

- **Social:** the authoritative autonomous cycle (render → host →
  autonomous-approve → submit → persist) runs from a machine that can
  **commit** the ledger — the owner's box or a worker running
  `npm run social:auto -- --once`. `/api/social-auto` is a lightweight
  trigger that submits already-prepared batches; treat its ledger writes
  as advisory until committed.
- **Email:** cadence is safe on Vercel because the weekly floor and
  last-digest state live in Supabase (`digest_state`). The local
  `digests.json` is a secondary log.

### Metrics autonomy (13E.7A, read-only)

`npm run social:metrics -- sync` polls Buffer's read methods for every
`PUBLISHED`/`QUEUED` placement and appends a snapshot to the ledger. It
writes `ledger.json`, so it is a **local operator CLI** (or a worker
cron), not a Vercel cron. Suggested cadence: every 6 h. Read-only — never
a mutation. Snapshot ages: 1 h / 24 h / 72 h / 7 d / 28 d.

---

## Operator dashboard

`npm run social:dashboard` gains an **Autonomous orchestration** panel
(read-only, no secrets): SOCIAL / EMAIL mode (OFF / DRY_RUN / LIVE /
SUSPENDED), stage, circuit state, last run + outcome + skip reason,
mutation failures in 24 h, last publish / last digest, ACTIVE subscriber
count, `DIGEST_SEND_ENABLED`.

---

## Commands

```
npm run social:auto -- --dry-run     # default; plan only, no mutation
npm run social:auto -- --once        # one cycle; mutates only if posture LIVE + circuit CLOSED
npm run social:auto -- --live        # request a live cycle (refused unless flags allow)
npm run social:auto -- --json        # machine-readable

npm run crm:auto -- --dry-run        # default; decide only, no send
npm run crm:auto -- --once
npm run crm:auto -- --live
npm run crm:auto -- --json
```

Run state: `.social-preview/autonomous/{social,email}/{runs,circuit}.json`
and `.social-preview/autonomous/email/digests.json` (all gitignored).

---

## How to enable — Stage 1 rollout (owner step; NOT done by AUTO-2)

**First deploy verification (before any flag):** confirm the endpoints
are deployed, `curl` them with no auth → 401, with `Bearer $CRON_SECRET`
→ `{ ok:true, skipped:"autonomous_disabled" }`; run `social:auto
--dry-run` + `crm:auto --dry-run` against production and confirm both are
`OFF` / no provider call; the dashboard shows both surfaces `OFF`; Buffer
+ Resend auth are healthy (`social:publish -- channels`, a Resend
domains/whoami check).

**Enable SOCIAL Stage 1 only** (do NOT enable email in the same step):

1. In `lib/social/rights.mjs` set `RIGHTS_STATE.publishing = "ALLOWED"`
   (a code-reviewed change — only if every compliance / rights /
   freshness gate genuinely passes) and deploy.
2. In Vercel set: `SOCIAL_AUTONOMOUS_ENABLED=true`,
   `SOCIAL_AUTONOMOUS_STAGE=STAGE_1`, `SOCIAL_AUTONOMOUS_KILL=false`,
   `SOCIAL_PUBLISH_ENABLED=true`, `SOCIAL_PUBLISH_DRY_RUN=false`,
   `SOCIAL_EPN_AI_CLASSIFICATION=NOT_APPLICABLE_CURRENT_PIPELINE`
   (already set), `BUFFER_ACCESS_TOKEN` (already set).
3. Run **one** production cycle: `npm run social:auto -- --once` from a
   machine that can commit `lib/social/distribution/ledger.json`. Accept
   outcome **A = NO_CONTENT** (no fresh live S/A candidate) or **B = one
   S/A Deal Drop submitted**. If B, verify content_id / live source /
   experiment variant / platforms / hosted assets / Buffer `provider_ref`s
   / ledger `QUEUED` / no duplicate / caption facts / CTA / UTMs /
   disclosure, then `npm run social:publish -- sync-batch <id>`.
4. Keep `EMAIL_AUTONOMOUS_ENABLED=false` and `DIGEST_SEND_ENABLED` unset
   during the social proof. **Max one social `content_id` published** —
   no bulk / backfill / catch-up.

**Then EMAIL Stage 1** (only after social Stage 1 is healthy AND):
ACTIVE subscribers > 0, ≥ 3 qualifying digest deals, Resend healthy,
unsubscribe contract intact. Set `EMAIL_AUTONOMOUS_ENABLED=true`,
`EMAIL_AUTONOMOUS_STAGE=EMAIL_STAGE_1`, `EMAIL_AUTONOMOUS_KILL=false`,
`DIGEST_SEND_ENABLED=true`. The `/api/crm-auto` crons then evaluate twice
weekly and send at most 1/week; if audience is empty or < 3 deals it
**skips** (`NO_ACTIVE_SUBSCRIBERS` / `no_digest`).

## Stage 2 promotion criteria (owner decision, not automatic)

Move `SOCIAL_AUTONOMOUS_STAGE` `STAGE_1 → STAGE_2` (1→2 content/day) only
after **≥ 1–2 weeks** of Stage 1 with: 0 circuit trips, no fact-drift
CANCELs that reached a viewer, published captions/facts spot-checked
correct, metrics syncing, and no duplicate posts. `EMAIL_STAGE_1 →
EMAIL_STAGE_2` (1→2/week) similarly — only with a growing ACTIVE list and
sustained ≥ 3-deal weeks. Never escalate both surfaces in the same week.

## How to disable

- **Routine:** set the surface's `*_AUTONOMOUS_ENABLED` back to unset/`false`.
  Mode returns to `OFF`. Capture / confirm / unsubscribe are unaffected.
- **Stage down:** set `*_AUTONOMOUS_STAGE=STAGE_0` / `EMAIL_STAGE_0`.

## Emergency kill procedure

**Fastest full stop (no redeploy):** in Vercel, **remove** the enabling
env var(s) — delete `SOCIAL_AUTONOMOUS_ENABLED` and/or
`EMAIL_AUTONOMOUS_ENABLED` (and/or `DIGEST_SEND_ENABLED` /
`SOCIAL_PUBLISH_ENABLED`). Vercel applies env changes to the **next cron
invocation without a redeploy** for scheduled functions; the endpoints
read `process.env` fresh each call and go to `OFF`. Also flip
`SOCIAL_AUTONOMOUS_KILL=true` / `EMAIL_AUTONOMOUS_KILL=true` so mode is
`SUSPENDED` even if `ENABLED` is later re-added by mistake.

1. Delete / set-false the enabling flags + set the KILL flags in Vercel.
   The next hourly / twice-weekly cron sees `OFF` / `SUSPENDED` and
   touches no provider. The CLIs (`social:auto`, `crm:auto`) pick up
   `.env.local` changes instantly.
2. A misbehaving provider trips the circuit on its own after 3 failures
   / 24 h → `AUTO_SUSPENDED`, no mutation, **owner `resumeCircuit`
   required** (no timer clear).
3. To stop only the digest, regardless of autonomy: unset
   `DIGEST_SEND_ENABLED` (CRM-1B kill switch — also read by
   `/api/send-digest`).
4. Resume: re-add the enabling flags, set the KILL flags back to `false`,
   and run `resumeCircuit` if the circuit had tripped.
