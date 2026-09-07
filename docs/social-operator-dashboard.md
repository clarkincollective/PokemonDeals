# Social Operator Dashboard — Phase 13E.9A

A lightweight, **read-only** operator view that combines, in one place:

```
TODAY'S CONTENT PLAN  +  REVIEW / APPROVAL STATE  +  DISTRIBUTION STATUS
  +  METRICS STATUS  +  BLOCKERS  +  FIRST-LIVE READINESS
```

It is operational UX only. It performs **no write action** (13E.9A §17).

---

## 1. Architecture — a CLI-generated static file, not a route

`npm run social:dashboard` (`scripts/socialDashboard.mjs`) reads local
state + a bounded DB read + the free eBay rate-limit read, and writes:

```
.social-preview/operator-dashboard/index.html   self-contained, <meta robots noindex>, no scripts, no secrets
.social-preview/operator-dashboard/dashboard.json   machine-readable snapshot (also the quota cache)
```

`.social-preview/` is a **gitignored** tree — the output is never
committed. There is **no app route, no page component, no API endpoint,
and nothing in any sitemap** for the dashboard. This is the smallest clean
solution (§1) and the strongest possible "not indexable / not public"
guarantee: there is nothing to protect because there is nothing served.

Flags: `--no-db` (skip the freshness / imageless DB reads), `--no-quota`
(skip the eBay rate-limit read — falls back to the cached value in
`dashboard.json`), `--json` (also print the snapshot to stdout).

Pure derivations live in `lib/social/operator.mjs` (quota state, per-item
status, per-service platform summary, first-live readiness, blocker list,
recovery state) so they are unit-tested without a DB or network.

---

## 2. Security

- **Not a route.** No public access is possible; there is no server-side
  surface. If it is ever served, it carries
  `<meta name="robots" content="noindex, nofollow, noarchive">`.
- **No secrets in the HTML.** The renderer has a `SECRET_RE` guard that
  **throws** rather than write a file containing a
  `BUFFER_ACCESS_TOKEN` / `SUPABASE_SERVICE_ROLE_KEY` / `CRON_SECRET` /
  `OPENAI_API_KEY` / `RESEND_API_KEY` / `EBAY_CLIENT_SECRET` / `sk-…` /
  JWT-shaped string. Tests exercise several data shapes and assert the
  HTML never matches that regex or a `Bearer …` token.
- **No Buffer token, no Supabase service key, no channel ids.** Channels
  are shown only as `connected: yes/no` — the raw Buffer channel ids
  (account-identifying) are never rendered.
- **No outreach recipient PII.** The outreach panel shows the prospect
  slug + status + timestamps only — never an email address.
- Not added to `robots.txt` or `sitemap.xml` (there is no route to add).

No custom auth is invented. If the file is later exposed through an
existing admin surface, reuse that surface's `CRON_SECRET` bearer check
(the pattern `app/api/admin/discovery-health` already uses).

---

## 3. Data sources (all READ-ONLY)

| section | source |
|---|---|
| Today's plan | `lib/social/planner/planner.buildPlan()` on the current `social:source` snapshot (or the committed fixture) — **pure, never persisted** |
| Plan states on file | `lib/social/planner/plans.json` (`loadPlans`; `expireStale` run on a **clone**, never saved) |
| Distribution status | `lib/social/distribution/ledger.json` + `batches.json` (`loadLedger` / `loadBatches` / `batchStatus` / `batchApprovalValid`) |
| Channels resolved | `lib/social/distribution/channels.json` (booleans only) |
| Media hosted | `lib/social/storage/hosted-assets.json` (`loadHostedAssets`) |
| Flags / rights | `readDistributionFlags()` + `RIGHTS_STATE` |
| Metrics | ledger rows' `metrics` / `metrics_snapshots` (13E.7A); `NOT_AVAILABLE_YET` when nothing is published |
| eBay quota | `getBrowseRateLimit()` from `lib/ebay.js` — the **free Developer-Analytics rate-limit read**, the same one the scan crons and `_waitForQuota.sh` use. **NOT a Browse call.** Optional + cached. |
| Freshness health | one bounded `fetchActiveDealPool()` read + `hoursSinceExactVerification` buckets + `isSociallyEligiblePremium` count |
| Image recovery | `scripts/_recover_run.out` tail line + a bounded `count` of `NO_TRUSTED_IMAGE` active rows |
| Outreach | `lib/outreach/records.json` — packz + pokemonpricetracker status only |
| Review pack | `.social-preview/distribution-review-pack/manifest.json` if present |

Performance (§18): one snapshot read, one plan compute, one bounded pool
read (≤ 3000 rows), one `head`-count query, one rate-limit read. No N+1,
no per-item DB round-trips.

---

## 4. Dashboard sections

1. **Daily operator summary** (§16) — Brisbane + UTC date, fresh social
   content count, planned placements, queued, published, top blocker,
   quota state + reset, first-live readiness.
2. **Today — recommended content plan** (§3) — time (Brisbane / US-ET /
   UTC) · platform · family · goal · card/subject · quality tier · score ·
   fresh-until · **STATUS** (PROPOSED / READY / APPROVED / QUEUED /
   PUBLISHED / FAILED / EXPIRED / UNAVAILABLE).
3. **Platform summary** (§4) — one card per Instagram / TikTok / X /
   YouTube: planned today, queued, published, failed, remaining ceiling,
   next proposed time, connection resolved. Each computed from that
   service's own slice — states are independent.
4. **Blockers** (§7) — coded (`NO_FRESH_LIVE_CONTENT`,
   `PUBLISHING_DISABLED`, `EPN_UNCLASSIFIED`, `STALE_SOURCE`,
   `CHANNEL_UNRESOLVED`, `PROVIDER_UNCONFIGURED`, `MEDIA_NOT_HOSTED`,
   `NO_BATCH`, `OWNER_APPROVAL_REQUIRED`, `QA_FAILED`, `RIGHTS_BLOCKED`,
   `PROVIDER_ERROR`, `QUOTA_RESERVE` / `QUOTA_RESET_PENDING`) with a short
   detail — never an exception dump.
5. **eBay Browse quota** (§8) — state (HEALTHY / LOW / RESERVE /
   RESET_PENDING / UNKNOWN), remaining / limit, reserve, reset, source
   (live / cache), the waiter's last log line. Read-only; the waiter is
   never restarted.
6. **Freshness health** (§9) — active deals, freshest `exact_verified_at`,
   counts verified ≤ 1h / ≤ 3h / ≤ 6h / ≤ 12h, social-eligible count. When
   the social-eligible count is 0 a banner states plainly that social
   starvation is a **verification-freshness** problem.
7. **Planner summary** (§10) — recommended placements, unfilled slots
   (labelled "reported, never padded"), plan-state counts, goal mix,
   family mix, warnings, "classified but not scheduled". `NO QUALIFYING
   CONTENT` is shown as a clean state.
8. **First-live status** (§12) — every gate + OVERALL (see §5 below).
9. **Content detail** (§5) — a collapsible block per planned item:
   content_id, family/goal, tier/score, why, score breakdown, diversity
   penalties, source ref, fresh-until, status. No fact editing.
10. **Review pack preview** (§6) — links + thumbnails for whatever assets
    exist (IG static / carousel / Reel / TikTok / YouTube Short), the
    exact frozen **X text**, and the **YouTube title + description**. Video
    is a link, not an embed.
11. **Social metrics** (§15) — `NOT_AVAILABLE_YET` until something
    publishes; then per-placement views / engagement / clicks / post URL
    from the 13E.7A layer. Missing / unsupported render as `—`, **never a
    fake 0**.
12. **Outreach status** (§13) — packz + Pokemon Price Tracker: QUEUED /
    SENT / FAILED + timestamps. No email addresses. No send controls.
13. **Image recovery status** (§14) — WAITING / RUNNING / COMPLETE /
    UNKNOWN from the log tail, last log line, count of NO_TRUSTED_IMAGE
    active rows. The process is never controlled.
14. **Approval commands** (§11) — the exact CLI commands to run
    (`prepare-batch`, `review`, `approve-batch`); `send` is shown as
    **DISABLED** with the 6-flag live checklist referenced. **No buttons.**

---

## 5. First-live readiness logic (§12)

Gates (each `{ ok, detail }`): `fresh_candidate`, `batch_created`,
`owner_approved`, `publishing_switch`, `live_mode`, `epn_classification`,
`provider_auth`, `channel_mapping`, `media_hosted`, `fact_drift`,
`ready_to_send`.

`firstLiveOverall(gates)` (`lib/social/operator.mjs`):

- **`READY FOR LIVE SEND`** — every gate is `ok` (including the live
  switches and an approved, untampered batch).
- **`READY FOR OWNER APPROVAL`** — the four **infra gates**
  (`fresh_candidate`, `provider_auth`, `channel_mapping`, `media_hosted`)
  are all `ok`, and the only remaining gaps are the owner's launch action
  (`batch_created` / `owner_approved` / `publishing_switch` / `live_mode` /
  `epn_classification` / `fact_drift`).
- **`BLOCKED`** — anything else. **It NEVER returns a non-BLOCKED value
  while any infra gate fails** (tested).

Current state: `BLOCKED` — publishing disabled, no fresh live content
(snapshot is a fixture), EPN unclassified, no batch, quota in RESERVE.

---

## 6. Read-only guarantee (§17)

`scripts/socialDashboard.mjs` and `lib/social/operator.mjs` contain **no**:
Buffer `createPost` / `updatePost` / `deletePost`, batch approval
(`approveBatch` / `approve`), `saveLedger` / `savePlans` / `saveBatches` /
`saveHostedAssets` / `savePostHistory`, `applyProvider*`, eBay Browse call
(`searchListings` / `searchNewlyListed` / `getItemsByLegacyIds`), outreach
provider / send (`outreach/provider`, `cmdSend`, `applySyncResult`),
image-recovery trigger (`_screenDealImages`, `--recover`), `child_process`
/ `spawn` / `execSync`, or any Supabase `insert` / `update` / `upsert` /
`delete`.

The **only** eBay call is `getBrowseRateLimit()` — the free
Developer-Analytics rate-limit read (not Browse), optional and cached.
`getSocialProvider()` is called **only** to read `.isConfigured()`.

`tests/scanner/social-operator-13e9a.test.mjs` (16) enforces all of the
above plus: noindex meta, no leaked token / key / channel id / email,
EXPIRED plan shown as EXPIRED, independent platform states, deterministic
ordered blocker list, unsupported metrics as `—`, and the no-content
state.
