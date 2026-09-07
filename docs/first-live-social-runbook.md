# First Live Social Publish — Runbook

Short, practical steps to take the **first** real social post live once a
fresh live deal candidate exists. Every command is `npm run social:publish -- <cmd>`.
Nothing here publishes until step 8 flips the owner flags and step 9 runs
with an explicit confirmation.

> Current status: publishing **DISABLED**. Buffer + Supabase hosting
> healthy. Channels resolved. Waiting on a fresh live content snapshot
> (`verify-deals` cron behind — see `docs/social-distribution.md` §13a).

---

## The flow

| # | step | command |
|---|---|---|
| 1 | **Fresh candidate arrives** — `verify-deals` has caught up; a real deal is exact-verified within the social ceiling. | `npm run social:source -- live` → check it is `empty:false`, note the `source_deal_id` / `card_tcgplayer_id` / `exact_verified_at` |
| 2 | **Render** from that snapshot. | `npm run social:video` → manifest must show `source_is_live: true`, `source_captured_at` current |
| 3 | **QA** — every clip `QA PASS`, real canonical card art, no seller imagery, no debug freshness line, `published:false`. | (verified in the `social:video` output) |
| 4 | **Host** the media to public storage (immutable, content-addressed). | `npm run social:publish -- host` then `-- verify-hosts` → every URL `HTTP 200`, correct MIME, `auth=false`, `range=true` |
| 5 | **Create the batch** — one `content_id`, the platforms you want. | `npm run social:publish -- prepare-batch <content_id> --platforms instagram,tiktok,x,youtube` |
| 6 | **Review** — read every placement: media, copy, CTA, freshness, QA, rights, duplicate, drift, READY. | `npm run social:publish -- review <batch_id>` → `READY TO APPROVE: yes` |
| 7 | **Approve the batch** — freezes the exact plan + a checksum. Does **not** publish. | `npm run social:publish -- approve-batch <batch_id>` |
| 8 | **Flip the owner live flags** (all independent — see the checklist below). | edit `lib/social/rights.mjs` (`publishing: "ALLOWED"`) + `.env.local` |
| 9 | **Send the batch** — explicit confirmation required. Re-runs every pre-send gate per placement, in send order, one failure does not stop the others. | `npm run social:publish -- send-batch <batch_id> --confirm-live` |
| 10 | **Sync** — poll Buffer for each QUEUED placement; `QUEUED → PUBLISHED` only on real `sent` + `sentAt` evidence. | `npm run social:publish -- sync-batch <batch_id>` |
| 11 | **Verify the platform result** (see §17 of `docs/social-distribution.md`) — provider status first, then the live URL if returned; caption/title/media/CTA correct; ledger updated; no duplicate. | `-- sync-batch` again, plus a manual glance at each platform |
| 12 | **Revert to safe posture** (optional, recommended after the first run): set `RIGHTS_STATE.publishing` back to `"DISABLED"`, unset `SOCIAL_PUBLISH_ENABLED`, `SOCIAL_PUBLISH_DRY_RUN` back to default. Published rows stay PUBLISHED. | edit `lib/social/rights.mjs` + `.env.local` |

A `FAILED` placement is **never** auto-retried: `npm run social:publish -- retry <job_id> --confirm-live`
(re-uses the same ledger row, re-runs every gate, refuses if the provider
already accepted it).

---

## §8 — owner live-flag checklist (all six, independent)

```
lib/social/rights.mjs   RIGHTS_STATE.publishing = "ALLOWED"      (one reviewed line)
.env.local              SOCIAL_PUBLISH_ENABLED = true
.env.local              SOCIAL_PUBLISH_DRY_RUN = false
.env.local              SOCIAL_EPN_AI_CLASSIFICATION = NOT_APPLICABLE_CURRENT_PIPELINE
                        (owner/compliance classification - NOT an eBay approval; see
                         docs/social-compliance-readiness.md §4a)
provider auth           BUFFER_ACCESS_TOKEN present (already set)
channels                lib/social/distribution/channels.json resolved (already done)
plus                    an APPROVED batch  +  the  --confirm-live  flag on send-batch
```

None of these weakens the others. `send-batch` re-checks all of them and
hard-fails on any gap; without `--confirm-live` it hard-fails before any
check.

---

## Send order (§7) and why

`x_post → instagram_reel → instagram_feed → instagram_carousel → tiktok → youtube_short`

- **X first** — text only, no media-upload dependency, fastest round-trip,
  the lowest-risk first live signal.
- **Instagram** — Business account, the most-vetted auto-publish path.
- **TikTok** — Business account; auto-publish is original-audio-only.
- **YouTube last** — largest asset, slowest platform-side processing.

One placement failing does not submit or retry any other. The result is
reported as `ALL_QUEUED` / `PARTIAL_SUCCESS` / `ALL_FAILED`.

---

## Fact-drift policy (§6) — enforced by `revalidatePlacement`

| change between approval and send | action |
|---|---|
| listed price changes at all (> $0.01) | **BLOCK** — the approved "$X vs $Y" creative is invalid |
| headline discount moves > ~2 percentage points | **BLOCK** |
| market reference moves > 2% | **BLOCK** |
| Market Mover movement % moves > ~3 points | **BLOCK** |
| listing has ended | **CANCEL** that placement |
| `exact_verified_at` ages past the social ceiling / snapshot is a fixture | **BLOCK** (`freshness_at_send`) |
| hosted asset sha ≠ approved artifact sha | **BLOCK** — re-host + re-approve |
| approved batch checksum no longer matches (copy/media/placement edited) | **BLOCK** — re-approve |
| Buffer channel id changed but alias still maps | re-resolve the id, proceed |
| Buffer alias no longer maps | **BLOCK** — reconnect the channel |

Copy is **never** mutated at send time.

---

## Rollback / partial failure

If e.g. X publishes, Instagram queues, TikTok fails, YouTube queues:

- verdict: **`PARTIAL_SUCCESS`**.
- Already-published / queued posts are **not** deleted automatically.
- The failed placement stays `FAILED` and needs an explicit
  `retry <job_id> --confirm-live` or owner action.
- The batch status becomes `PARTIAL_SUCCESS`; `sync-batch` keeps updating
  each placement independently.

---

## Future: content-performance tracking (design only)

The ledger row reserves (unused today): `platform_post_url`,
`published_at`, `views`, `likes`, `comments`, `shares`, `saves`,
`clicks`, `last_metrics_sync`. Populated later from Buffer's read-only
metrics API (`aggregatedPostMetrics` / `post.metrics`) — no scraping.
