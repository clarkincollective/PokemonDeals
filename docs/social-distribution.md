# Social Distribution — Phase 13E.5A

**Status:** infrastructure + dry-run only. **Nothing has been published or
scheduled. No social API call has been made.** `social:publish` cannot
publish in this phase — several independent gates are all off.

This layer takes the artifacts the existing pipelines already produce
(`social:daily` static, `social:video` 13E.4) and adds a provider-neutral
path to *eventually* schedule / autopost them to Instagram and TikTok via
**Buffer**. It does not render anything and does not change the creative
system.

Legend: **[VERIFIED PROVIDER FACT]** checked against official Buffer docs
2026-09-07 · **[IMPLEMENTED]** built this phase · **[BLOCKED ON OWNER
AUTH]** code path exists, waiting on a credential/decision · **[FUTURE]**
designed, deliberately not built.

---

## 1. Verified current Buffer capabilities  [VERIFIED PROVIDER FACT]

Sources: `developers.buffer.com` (API reference, `/guides/api-limits`),
`support.buffer.com` articles *Using Instagram with Buffer* (554),
*Scheduling Instagram posts, reels, stories, and notifications* (657),
*Using TikTok with Buffer* (559), *Connecting your Instagram account*
(568). Checked 2026-09-07.

| Capability | Current state |
|---|---|
| Public API | **Current and open.** GraphQL at `graph.buffer.com`; docs at `developers.buffer.com`. (This replaces the long-deprecated `api.bufferapp.com` v1.) |
| Auth | **API key.** The account owner generates it at `https://publish.buffer.com/settings/api` and sends it as `Authorization: Bearer <key>`. No OAuth app registration needed for first-party use. |
| Channels | `channels(input: ChannelsInput!)` lists the org's connected channels with stable ids; filter by `locked` / product type. |
| Create post | `createPost(input: CreatePostInput!)` — fields we use: `channelId`, `text`, `assets` (ordered image/video list), `dueAt` (schedule), `saveToDraft`, `schedulingType` (`automatic` \| `notification`), `mode` (`addToQueue` \| `customScheduled` \| `shareNow` \| `shareNext`), `metadata` (service-specific), `tagIds`. |
| Media | `assets[]` carry a `url` (+ optional `thumbnailUrl`, `altText`, IG user tags). Images and video are supported; assets are referenced by URL. |
| Instagram publishing | **Supported.** Automatic (direct) publish for **Business / Creator** accounts; Personal accounts are notification-only. |
| Instagram — Facebook Page required? | **No, not for publishing.** A linked Facebook Page is only needed for Buffer *Analyze* (insights) and for **location tagging**. Direct publishing works without one. |
| Instagram Reels | **Can be scheduled and auto-published.** Reels with music / effects / caption links fall back to notification publishing. Limits: 3 s – 15 min; 4:5 – 9:16; ≤ 1920 px wide. |
| Instagram carousels | **Can be scheduled and auto-published.** Up to **10** images (Buffer/IG API cap). |
| Instagram stories | **Notification publishing only.** (Out of scope for this system — we post feed / carousel / reel.) |
| First comment / hashtags | `metadata.instagram.firstComment` is supported, but **only on posts set to automatic publishing**. IG allows ≤ 5 hashtags in the caption body and ≤ 30 in the first comment. |
| TikTok publishing | **Supported.** Requires a **TikTok Business** account. Automatic publish uses **original audio only** (trending sounds are not available via the API); notification publishing is the alternative for trending audio. |
| TikTok video | Vertical video, 9:16 nominal. |
| Scheduling | `dueAt` (explicit datetime) or `addToQueue` (Buffer's posting schedule); `saveToDraft: true` for draft-only. |
| Draft / approval workflow | Buffer post statuses: `draft`, `buffer` (queued), `sent` (published), `failed`, `paused`. `editPost` carries an `approvalChange` field. Our layer keeps its **own** approval gate (below) rather than relying on Buffer's. |
| Rate limits | **Per client (API key)**, rolling windows: 100 / 15 min, 250–500 / 24 h, 3 000–15 000 / 30 days (plan-dependent). HTTP `429` + `Retry-After`; a 429 does not consume quota. |
| Webhooks / status push | **No post-status webhook in the public API today.** Status is confirmed by polling `post(input: { id })` → `status` + `sentAt`. |

**Net:** Buffer is a genuine single scheduling/autopost layer for both
Instagram and TikTok, and — importantly — **Instagram does not require a
Facebook Page link** for publishing. The one hard account requirement is
Business/Creator on Instagram and Business on TikTok.

---

## 2. Auth & account requirements  [BLOCKED ON OWNER AUTH]

Nothing is wired to a credential. To move past dry-run the owner must:

1. In Buffer, connect **Instagram** (Business or Creator account) and
   **TikTok** (Business account) as channels.
2. Generate a Buffer API key at `https://publish.buffer.com/settings/api`.
3. Add it to `.env.local` (git-ignored, server-side only — never a
   `NEXT_PUBLIC_` var):

   ```
   BUFFER_ACCESS_TOKEN=...
   ```

4. Run `npm run social:publish -- channels` — it prints each connected
   channel's id. Paste the Instagram id under `instagram_main` and the
   TikTok id under `tiktok_main` in
   `lib/social/distribution/channels.json`.

Until step 3, `getSocialProvider()` returns the **null provider**, which
refuses every call — there is no code path from this repo to a social
network.

---

## 3. Architecture  [IMPLEMENTED]

```
existing artifact (.social-preview/…)         lib/social/distribution/artifacts.mjs
        │  read-only ingest, fail closed on stale/missing
        ▼
normalised content artifact  ─────────────►  lib/social/distribution/artifactMap.mjs
   (family, variant, media, caption, qa, rights, snapshot)   family → platform eligibility
        │                                                    media ratio/duration envelope
        ▼
prepare  ──────────────────────────────────►  lib/social/distribution/ledger.mjs
   freezes caption/hashtags/cta/facts into a DRAFT ledger row
        │
        ▼
readiness gates  ─────────────────────────►  lib/social/distribution/gates.mjs
   DRAFT → READY when every non-approval gate passes
        │
        ▼
approve (human, explicit, per-row)  ──────►  READY → APPROVED
        │
        ▼
send  ── runAllGates() must ALL pass ─────►  lib/social/providers/buffer.mjs
   provider accepts  →  QUEUED  (NOT published)
        │
        ▼
sync  ── poll post(id) ──────────────────►  QUEUED → PUBLISHED only on real
                                             `sent` + `sentAt` evidence
```

Files:

| File | Role |
|---|---|
| `lib/social/distribution/config.mjs` | reads the safety flags; UTC/Brisbane time helpers |
| `lib/social/distribution/artifacts.mjs` | read-only ingest of `.social-preview/` outputs |
| `lib/social/distribution/artifactMap.mjs` | deterministic family → platform eligibility + media compatibility |
| `lib/social/distribution/ledger.mjs` | ledger record shape + state machine (pure) |
| `lib/social/distribution/gates.mjs` | the preflight gate stack |
| `lib/social/distribution/ledger.json` | the durable ledger (starts `[]`) |
| `lib/social/distribution/channels.json` | stable name → Buffer channel id (starts unresolved) |
| `lib/social/providers/buffer.mjs` | Buffer GraphQL adapter (implemented, inert without a token) |
| `lib/social/providers/index.mjs` | provider selection; null provider default |
| `scripts/socialPublish.mjs` | the CLI (`npm run social:publish`) |

The renderer, `social:daily`, and `social:video` are **unchanged** and
import nothing from this layer (asserted in
`tests/scanner/social-distribution.test.mjs` and `-preview-system.test.mjs`).

---

## 4. Publishing ledger — state machine  [IMPLEMENTED]

One row per `content_id :: platform :: creative_variant`
(`lib/social/distribution/ledger.json`).

```
DRAFT ──► READY ──► APPROVED ──► QUEUED ──► PUBLISHED
  │         │          │           │
  └─────────┴──────────┴───────────┴──►  CANCELLED   (human pulls it back, pre-publish)
                        │           │
                        └───────────┴──►  FAILED     (provider reject at submit, or sync finds a hard failure)
```

- **`provider acceptance != PUBLISHED`.** A `createPost` success lands the
  row on **QUEUED** and records `provider_ref` + `queued_at`.
- **`published_at` is only ever set by `applyProviderEvidence()`** on a
  real `status === "sent"` **with** a `sentAt` timestamp — and it stores
  *the provider's* timestamp, never our local clock.
- Each row captures: `content_id`, `creative_family`, `creative_variant`,
  `platform`, `content_goal`, `media` (kind/files/dims/duration),
  frozen `caption` + `hashtags` + `first_comment`, `cta_url`,
  `channel_key`/`channel_id`, `provider`/`provider_ref`, `status`,
  frozen `qa`, frozen `rights`, `source_commit`, frozen `snapshot`
  (deterministic facts), `scheduled_for`, and the full timestamp set
  (`created_at`, `approved_at`, `queued_at`, `published_at`, `failed_at`),
  `last_error`, `retry_count`, plus append-only `dry_runs[]` and
  `history[]`.

---

## 5. Safety gates  [IMPLEMENTED]

`send` runs `runAllGates()` and **hard-fails** on any blocker. The gates
are deliberately independent — defeating one still leaves the rest.

| Gate | Passes only when |
|---|---|
| `publish_switch` | `RIGHTS_STATE.publishing === "ALLOWED"` **and** `SOCIAL_PUBLISH_ENABLED=true` — **both**. (Today: `DISABLED` + unset.) |
| `live_mode` | `SOCIAL_PUBLISH_DRY_RUN` is explicitly `"false"`. Default = dry run. |
| `epn_compliance` | `EPN_AI_TOOLS_APPROVED=true` — the owner has recorded that the EPN prerequisite is satisfied (see §7). Default = not approved. |
| `qa_pass` | the artifact variant's QA verdict is `ok` with an empty `failed[]`. |
| `rights_cleared` | the artifact's frozen `rights_state` is byte-identical to `lib/social/rights.mjs` **and** `ppt_social_data` + `card_image` are `CLEARED`. Rights drift = hard fail. |
| `owner_approval` | the ledger row is `APPROVED` (explicit, per-row). |
| `provider_auth` | a social provider is configured (`BUFFER_ACCESS_TOKEN`). |
| `channel_resolved` | the row's platform maps to a real Buffer channel id in `channels.json`. |
| `placement_eligible` | `(family, media kind, platform)` is an approved placement (artifactMap). |
| `media_compatible` | media ratio / duration / item-count is inside the platform's accepted envelope. |
| `media_present` | the media files exist on disk. |
| `caption_frozen` | caption is non-empty, carries the `Ad` disclosure, is **unchanged** vs the artifact, and within hashtag limits. |
| `deterministic_facts` | frozen `market_price`+`discount_pct` or `movement` on the row — or, for a 9:16 video, a passing video QA gate (which re-derives every on-screen number from the verified payload) — or `brand_ad`. |
| `not_duplicate` | no other in-flight/published ledger row for the same placement (owner `--force` overrides this gate only). |

### Rights / compliance state (unchanged, from `lib/social/rights.mjs`)

| key | state | meaning |
|---|---|---|
| `ppt_social_data` | **CLEARED** | derived editorial market figures may appear off-platform (owner, 13E.1) |
| `card_image` | **CLEARED** | real canonical TCGplayer card art may be composited (owner, 13E.2.1); fail closed on wrong/missing printing |
| `ebay_seller_images` | **NOT_CLEARED** | eBay listing photos are never composited — the render system never uses them, so this never blocks; tracked separately so a future partial clearance can't leak |
| `ebay_genai` | **NOT_ALLOWED** | no eBay data to any GenAI — the whole system is deterministic, so no code path exists |
| `publishing` | **DISABLED** | the master switch; a one-line reviewed diff flips it to `ALLOWED` when the time comes |

The distribution layer does **not** weaken any of these.

---

## 6. EPN / affiliate-policy preflight  [BLOCKED ON OWNER AUTH]

`docs/social-compliance-readiness.md` (13D.1) records that the EPN "AI
Tools" / GenAI approval **has not been filed or granted**, and that an EPN
Quality review was active. This system's caption/number path is fully
deterministic (no eBay data reaches a model), so it does not *technically*
require that approval — but per the phase brief the prerequisite is
represented as an **explicit gate the owner must clear**:

```
EPN_AI_TOOLS_APPROVED=true      # only when the owner has confirmed the EPN prerequisite is satisfied
```

Until it is set, `epn_compliance` blocks every `send`. Setting it is an
owner decision, not something this system infers.

---

## 7. CLI  [IMPLEMENTED]

```
npm run social:publish -- list                         artifacts + ledger + current safety posture
npm run social:publish -- channels                     discover Buffer channels (needs BUFFER_ACCESS_TOKEN)
npm run social:publish -- prepare <id> <platform> [--cut reel|tiktok] [--at <iso>]
                                                       build/refresh a DRAFT row (freezes the caption); runs readiness gates
npm run social:publish -- dry-run <job_id>             run the FULL gate stack; mutate nothing external
npm run social:publish -- approve <job_id>             READY → APPROVED (explicit human approval)
npm run social:publish -- send <job_id> [--force]      HARD-FAILS unless every gate passes
npm run social:publish -- sync <job_id>                poll the provider; QUEUED → PUBLISHED only on real evidence
npm run social:publish -- review-pack                  build the dry-run distribution review pack
```

`<platform>` = `instagram_feed` | `instagram_carousel` | `instagram_reel`
| `tiktok`. `<id>` = a `content_id`, a `<source>/<family>` key
(e.g. `video:13e4/deal_drop`), or a daily `content_type`
(e.g. `deal_of_day`).

`send` additionally refuses, past the gate stack, if the null provider is
active or `RIGHTS_STATE.publishing != ALLOWED` (defence in depth).

### Test mode  [IMPLEMENTED]

Default safety is **non-publishing**, enforced by *four* independent
signals that must ALL be flipped:
`RIGHTS_STATE.publishing = ALLOWED` **and** `SOCIAL_PUBLISH_ENABLED=true`
**and** `SOCIAL_PUBLISH_DRY_RUN=false` **and** `EPN_AI_TOOLS_APPROVED=true`
— plus a configured provider and a resolved channel. A developer who runs
`social:publish send` by accident gets a printed list of blockers and
exit 1; nothing leaves the machine.

---

## 8. Artifact → platform mapping  [IMPLEMENTED]

Deterministic, in `lib/social/distribution/artifactMap.mjs`. Nothing goes
to every platform.

| Creative family | Media it distributes as | Eligible placements |
|---|---|---|
| `deal_drop` | 4:5 still | `instagram_feed` |
| `deal_drop` | 9:16 video | `instagram_reel` + `tiktok` |
| `market_mover` | 4:5 still | `instagram_feed` |
| `market_mover` | 9:16 video | `instagram_reel` + `tiktok` |
| `hook_carousel` | 4:5 carousel (≤10) | `instagram_carousel` |
| `hook_carousel` | 9:16 video | `instagram_reel` + `tiktok` |
| `brand_ad` | 4:5 still | `instagram_feed` |
| `brand_ad` | 9:16 video | `instagram_reel` + `tiktok` |
| `market_snapshot` | 4:5 still | `instagram_feed` (aggregate view — never video) |

Media envelope checks (independent second guard): IG feed / carousel
image 3:4 – 1.91:1; reel 4:5 – 9:16, ≤ 1920 px wide, 3 s – 15 min;
carousel 2 – 10 slides; TikTok vertical, 3 s – 10 min.

---

## 9. Captions & facts  [IMPLEMENTED]

`prepare` **freezes** the platform caption (from the artifact's
`caption-instagram.txt` / `caption-tiktok.txt` or the video manifest),
the hashtag array, the CTA URL, the `content_id`, and a `snapshot` of the
deterministic facts (`market_price`, `discount_pct`, or `movement`) onto
the ledger row. `send` re-reads the artifact and the `caption_frozen`
gate fails if anything drifted. Captions are never regenerated at publish
time — no LLM, no factual drift. The disclosure line
(`Ad · PokemonDealFinder is an eBay Partner Network affiliate…`) is
required by the gate.

---

## 10. Scheduling & timezones  [IMPLEMENTED]

- Internally every timestamp is **UTC ISO** (`toUtcIso()`).
- A schedule input **must** carry an explicit offset or trailing `Z`. A
  bare `2026-09-10 14:00` is rejected — no timezone is ever assumed.
- `brisbaneLabel()` renders a UTC instant in `Australia/Brisbane`
  (UTC+10, no DST) for the reviewer, display-only.
- This phase is **dry-run**: `prepare --at <iso>` serialises the schedule
  onto the row and the review pack shows it, but nothing is sent to
  Buffer.

---

## 11. Failure handling  [IMPLEMENTED]

Fail **closed**, never silently substitute another asset, for: missing
artifact, failed/absent QA, rights drift, missing approval, missing
provider auth, unresolved channel, unsupported/wrong-ratio media, missing
media file, provider error / rate limit, duplicate placement, malformed
or drifted caption, missing frozen deterministic facts, stale source
artifact. A provider reject at submit → `FAILED` with a truthful
`last_error` and **no automatic retry**.

---

## 12. First dry-run review pack

`npm run social:publish -- review-pack` →
`.social-preview/distribution-review-pack/manifest.json`.

For each item it shows `content_id`, artifact path, frozen caption,
creative family, content goal, platform, channel placeholder, planned
CTA, QA state, rights state, and distribution state — and the gate
verdict (`would send?` — always **NO** this phase).

The static IG still + carousel slots come from `social:daily`; when the
deal pool is thin that command selects **0** posts and those slots report
`UNAVAILABLE` (the correct fail-closed outcome) — the 13E.4 video
artifacts populate the rest. See the FINAL REPORT for the run captured
this phase.

---

## 13. Autopilot — design only  [FUTURE — NOT BUILT]

```
real deal data → planner → render → QA → approval policy → scheduler → publish → status sync
```

- The pieces exist: selection (`social:daily`), render, QA
  (`videoQa` / review checklist), this distribution layer.
- The missing piece is a **scheduler** that walks approved ledger rows
  and calls `send` on a cadence — deliberately not built.
- Initial future mode keeps `HUMAN_APPROVAL=true`: a human still approves
  every row. Later, *selected low-risk families* (e.g. `brand_ad`, which
  carries no per-deal fact) could move to an auto-approval policy —
  behind its own explicit flag, with the freshness re-check at publish
  time that a manual workflow can't guarantee (see
  `docs/social-compliance-readiness.md` §4).
- There is **no uncontrolled auto-post loop** and none is built here.

---

## 14. What is NOT done / open items

- **[BLOCKED ON OWNER AUTH]** Buffer API key + Instagram/TikTok channel
  connection + channel-id mapping.
- **[BLOCKED ON OWNER AUTH]** `EPN_AI_TOOLS_APPROVED` decision.
- **[BLOCKED ON OWNER]** flipping `RIGHTS_STATE.publishing` to `ALLOWED`
  (one reviewed line) and `PokemonPriceTracker` / EPN written
  confirmations noted in `docs/social-compliance-readiness.md` §5–6.
- **[FUTURE]** a true multi-slide 4:5 carousel *export* from
  `social:daily` (today it renders one representative 4:5 still per
  family); the distribution layer already models `carousel_45` with ≤10
  items.
- **[FUTURE]** the scheduler / autopilot policy engine (§13).
- **[FUTURE]** Buffer asset upload — the current adapter passes asset
  **URLs**; a hosted-URL step (or Buffer's media upload endpoint) is
  needed before a real send, since `.social-preview/*.mp4` is local.
