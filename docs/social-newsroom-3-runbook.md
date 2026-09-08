# SOCIAL-NEWSROOM-3 — planned-backlog refill runbook

The planned editorial-backlog engine is **built and dry-run-proven** but
**NOT LIVE**. Live activation is three owner steps this session could not
perform (production env vars, a real Buffer write to live IG/X, and cron
activation). Everything else — the refill engine, the protected route, the
operator command, the guardrails, the retention monitor, the tests — is
shipped in commit for this phase.

Fresh/live Deal Drop autonomy (`SOCIAL_AUTONOMOUS`, Stage 1,
`RIGHTS_STATE.publishing`) and email autonomy are **untouched and stay
OFF**. This engine only *schedules editorial content days ahead*.

## What runs where

The full pipeline **build → render → QA → visual consensus → host** needs
headless Chrome and runs from a **committing machine / CI runner**, not a
Vercel function (the same split `/api/social-auto` uses):

```
npm run social:backlog -- --build      # persist calendar-placed editorial stories
npm run social:backlog-render          # render + STACK QA + (CONDITIONAL) staged consensus + host -> BUFFER_READY
npm run social:backlog -- --refill     # SHARED queue+reconcile stage: schedule a small diverse IG+X batch
```

`/api/social-backlog-refill` (CRON_SECRET-protected, `maxDuration 120`,
advisory-locked) runs **only** the last stage — it schedules
already-`BUFFER_READY` placements. If nothing is `BUFFER_READY` it returns
a benign `NOTHING_TO_QUEUE` / `BACKLOG_LOW_BUT_NO_QUALITY_CONTENT`.

`--refill` and the route call the **one** shared implementation,
`lib/newsroom/backlogRefill.refillQueueReconcile()`.

## Guardrails (all fail-closed, enforced in `backlogRefill.mjs`)

| # | guardrail |
|---|---|
| SS2 | `SOCIAL_BUFFER_BACKLOG_ENABLED` unset ⇒ dry-run, no provider call |
| SS5 | Instagram + X only; YouTube manual; **TikTok `NOT_PLATFORM_FIT`** (never treated as EMPTY) |
| SS6 | `MANUAL_ONLY` (`AUCTION_BID_VS_TOTAL`, `BIGGEST_MOVERS`) never queues |
| SS7 | `CONDITIONAL` (`DEAL_DROP`, `THREE_UNDER_25`, `WHY_SOLD_PRICES_MATTER`) needs, for the **exact `artifact_sha256`**: latest STACK PASS **and** a consensus PASS under `VISUAL_REVIEW_POLICY_VERSION = 3c.1`; any FAIL blocks |
| SS12 | initial horizon: IG 3–5 d, X 2–3 d (`INITIAL_HORIZON_DAYS`) |
| SS13 | Deal Drops capped at 1 in the first backlog; education/market first |
| SS14 | `deal_hero` only into a **near-term** slot (≤ 30 h) whose `latest_safe_publish_at` covers it |
| SS15/25 | every placement re-validated against its scheduled time; a stale story is skipped, never queued |
| SS17 | reserved fresh capacity (IG 30 %, X 40 %) is excluded from editorial capacity by `backlogHealth` — planned content never fills it |
| SS19 | `FEED_PASS` required over the batch; `FEED_FAIL` aborts the run |
| SS20 | commercial share ≤ 40 % initial; the run trims commercial picks to hold the ceiling |
| SS21 | `SOCIAL_BUFFER_BACKLOG_MODE=scheduled` — provider accept ⇒ `BUFFER_QUEUED`, **never** `PUBLISHED` without provider sent-evidence |
| SS22 | idempotent: a placement with a `buffer_provider_ref` is never re-queued |
| SS23 | every queued placement is reconciled; a `published` read-back ⇒ abort + circuit failure; drift ⇒ circuit failure |
| SS24 | backlog circuit: 3 failures / 24 h ⇒ `BACKLOG_SUSPENDED` (owner-resume) |
| SS34 | advisory lock (`social_qa_runs` `REFILL_LOCK` marker, 15-min TTL) ⇒ `ALREADY_RUNNING` |
| SS11 | no filler — nothing qualifies ⇒ `BACKLOG_LOW_BUT_NO_QUALITY_CONTENT` (a successful safe outcome) |

## Refill schedule (prepared, NOT in `vercel.json`)

`REFILL_SCHEDULE.cron_hint = "0 20 * * 0,3"` — **20:00 UTC Sun + Wed =
06:00 Australia/Brisbane Sun + Wed** (UTC+10, no DST): a pre-business
editorial planning window. `REFILL_SCHEDULE.activated = false`.

## Owner steps to go LIVE (in order)

1. **Set production env** (Vercel → project → Environment Variables, Production):
   - `SOCIAL_BUFFER_BACKLOG_ENABLED=true`
   - `SOCIAL_BUFFER_BACKLOG_MODE=scheduled`
   - (leave `SOCIAL_AUTONOMOUS_ENABLED`, `SOCIAL_PUBLISH_ENABLED`, Stage-1 flags **unset**; do **not** change `RIGHTS_STATE.publishing`.)
2. **Proof refill** on a committing machine, with the same env:
   ```
   npm run social:backlog -- --build
   npm run social:backlog-render
   npm run social:backlog -- --refill          # now a REAL scheduled-mode run
   npm run social:backlog -- reconcile         # confirm: BUFFER_QUEUED, published=false, no drift, no dup
   npm run social:dashboard                     # backlog-health + refill panel
   ```
   Verify: 0 immediate sends, 0 `PUBLISHED`, 0 duplicate refs, 0 stale
   scheduled content, 0 `MANUAL_ONLY` queued, IG ≤ 5 d / X ≤ 3 d,
   commercial ≤ 40 %, feed `FEED_PASS`.
3. **Activate the cron** only after step 2 reconciles cleanly:
   - add to `vercel.json` `crons`: `{ "path": "/api/social-backlog-refill", "schedule": "0 20 * * 0,3" }`
   - set `REFILL_SCHEDULE.activated = true` in `lib/social/newsroom/refill.mjs`
   - deploy.
   The route still verifies every flag itself — the cron firing only means *evaluate*.

To pause later: unset `SOCIAL_BUFFER_BACKLOG_ENABLED` (route goes inert,
cron becomes a no-op) or set `SOCIAL_BUFFER_BACKLOG_KILL=true`.

## Retention (SS35)

`lib/social/newsroom/qaRetention.qaRetentionReport()` classifies
`social_qa_runs` rows (`RETAIN_FOREVER` for any row that gated a
`BUFFER_QUEUED`/`PUBLISHED` decision or is a consensus row;
`DEV_RETRY` otherwise) and warns at 5 000 / alerts at 20 000 rows. **No
row is deleted this phase.** Current: ~404 rows → `OK`. The dashboard
`editorial_backlog.refill.qa_retention` shows the projection.
