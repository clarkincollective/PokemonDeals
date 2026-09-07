# Social Distribution — Phase 13E.5A · 13E.5B · 13E.5C · 13E.6A · 13E.7A

**Status:** infrastructure + dry-run only. **Nothing has been published or
scheduled.** Buffer calls made: **read-only** `account` / `channels`
queries + (13E.7A) read-only `post` / `aggregatedPostMetrics` metrics
queries — **no `createPost`.** Media is uploaded to public storage
(13E.5C) — hosting a file is not posting it. `social:publish` cannot publish — several independent gates are
all off (see §5, §15).

This layer takes the artifacts the existing pipelines already produce
(`social:daily` static, `social:video` 13E.4) and adds a provider-neutral
path to *eventually* schedule / autopost them via **Buffer** to:

**Instagram · TikTok · X (Twitter) · YouTube (Shorts)** — all four
channels are connected (Buffer Essentials plan) and resolved in
`lib/social/distribution/channels.json` (13E.5B).

It does not render anything and does not change the creative system.

Legend: **[VERIFIED PROVIDER FACT]** checked against official Buffer docs /
live GraphQL introspection 2026-09-07 · **[IMPLEMENTED]** built ·
**[BLOCKED ON OWNER]** code path exists, waiting on an owner decision ·
**[FUTURE]** designed, deliberately not built.

## 13E.5B / 13E.5C changes at a glance

- **Endpoint corrected.** The live Buffer GraphQL API is `https://api.buffer.com`
  (Bearer API key), **not** `graph.buffer.com` — the 13E.5A guess was
  wrong; fixed in `lib/social/providers/buffer.mjs` and verified by
  introspection against the owner's token.
- **Channels resolved:** `instagram_main`, `tiktok_main`, `x_main`,
  `youtube_main` → real Buffer channel ids in `channels.json`
  (`npm run social:publish -- channels`).
- **Two new platforms:** `x_post` and `youtube_short` added to
  `artifactMap.mjs` (eligibility + media envelopes) with their own
  deterministic copy in `lib/social/distribution/platformCopy.mjs`
  (X post text ≤280; YouTube Short title ≤100 + description).
- One `content_id` now fans out to up to four independent ledger rows,
  one per platform; a failure on one platform never touches the others.
- **13E.5C:** public media hosting via **Supabase Storage** (bucket
  `social-public`); content-addressed, immutable, dedup'd. `prepare`
  freezes the public URL; `media_present` now requires it; a new
  `asset_not_drifted` gate re-checks the local sha before send. The stale
  `freshness.label` in the 13E.4 masters was fixed by re-running
  `social:video`.

---

## 1. Verified current Buffer capabilities  [VERIFIED PROVIDER FACT]

Sources: live GraphQL introspection against the owner's Essentials-plan
token; `developers.buffer.com` (authentication, API reference,
`/guides/api-limits`); `support.buffer.com` articles *Using Instagram
with Buffer* (554), *Scheduling Instagram posts, reels, stories,
notifications* (657), *Using TikTok with Buffer* (559), *Using X/Twitter
with Buffer* (561), *Using YouTube Shorts with Buffer* (562), *Character
limits for each social network* (588), *Does Buffer have an API* (859).
Checked 2026-09-07.

### Shared API facts

| Capability | Current state |
|---|---|
| Endpoint | **`https://api.buffer.com`** — GraphQL, POST. (Corrected in 13E.5B; the 13E.5A `graph.buffer.com` guess was wrong. `api.bufferapp.com` v1 is retired.) |
| Auth | **Personal API key.** Owner generates it at `https://publish.buffer.com/settings/api`; sent as `Authorization: Bearer <key>`. No OAuth-app registration for first-party use. |
| Account / org | `query { account { organizations { id } } }` → `organizationId`, required by `channels`. |
| Channels | `query { channels(input:{ organizationId }) { id name displayName service serviceId type isLocked isDisconnected } }`. |
| Create post | `mutation { createPost(input: CreatePostInput!) { ...on PostActionSuccess { post { id status } } ...on <Error> { message } } }`. `CreatePostInput`: `channelId`, `text`, `assets:[AssetInput!]!`, `dueAt`, `mode: ShareMode!` (`addToQueue`\|`customScheduled`\|`shareNext`\|`shareNow`), `schedulingType: SchedulingType!` (`automatic`\|`notification`), `saveToDraft`, `needsApproval: Boolean!`, `metadata: PostInputMetaData`, `tagIds`. |
| Assets | `AssetInput = { image:{ url, thumbnailUrl? } } | { video:{ url, thumbnailUrl? } }`. **URLs must be PUBLIC — Buffer does no direct upload.** (Handled in §13 — Supabase Storage.) |
| Post types | `PostType` enum: `post`, `reel`, `carousel`, `short`, `story`, `thread`, … We use `post`/`carousel`/`reel`/`short`. |
| Post status | `query { post(input:{ id }) { id status sentAt error } }`. `PostStatus`: `draft`, `scheduled`, `needs_approval`, `sending`, `sent`, `error`. Only `sent` **with** `sentAt` = real publish evidence. |
| Scheduling | `dueAt` (+ `mode: customScheduled`) for an explicit time, else `mode: addToQueue`; `saveToDraft: true` for draft-only. |
| Rate limits | **Per API key**, rolling windows. Essentials: 3 keys, **7 500 req / 30 days**; 100 / 15 min; 250–500 / 24 h. HTTP `429` + `Retry-After`; a 429 does not consume quota. |
| Webhooks | **None for post status.** Confirm by polling `post(id)`. |

### Instagram  [channel `instagram_main` — Business account]

| | |
|---|---|
| Static image | ✅ auto-publish (feed). 3:4 – 1.91:1. |
| Carousel | ✅ auto-publish. **≤ 10 images**, same ratio range. |
| Reels | ✅ auto-publish. 3 s – 15 min; 4:5 – 9:16; ≤ 1920 px wide. Music / effects / caption-links → notification only. |
| Caption | `text`. First comment via `metadata.instagram.firstComment` — **auto-publish posts only**. ≤ 5 hashtags in caption body, ≤ 30 in first comment. |
| Facebook Page required? | **No** — only for Analyze / location tagging. |
| Direct publishing | ✅ (Business/Creator). Personal = notification only. |
| `metadata.instagram` | `type: PostType!`, `shouldShareToFeed: Boolean!`, `firstComment`, `link`, `geolocation`. |

### TikTok  [channel `tiktok_main` — Business account]

| | |
|---|---|
| Vertical video | ✅ auto-publish. 3 s – 10 min. |
| Direct publishing | ✅ (**TikTok Business account required**). |
| Caption | `text`; optional `metadata.tiktok.title`. |
| Audio | Auto-publish uses **original audio only** (no trending-sound library via API); notification publishing is the alternative. |
| Static image | ❌ not used — video only (per strategy §8). |

### X / Twitter  [channel `x_main` — profile]

| | |
|---|---|
| Text post | ✅. **280 chars** on a standard account (emoji = 2, URLs count their full length). Extended count needs X Premium — **not assumed**. |
| Image post | ✅ up to **4 images** (or **1 video**, or 1 GIF — not mixed). |
| Video post | ✅ (1 per post). We keep X to text + optional single still. |
| Multi-image | ✅ ≤ 4. |
| Link handling | Posted as plain text; **link previews are unavailable for posts > 280 chars** (API limitation) — another reason we stay ≤ 280. |
| Scheduling | ✅ via `dueAt`. |
| Threads | `metadata.twitter.thread` exists — **not used** this phase (§6: no thread generation). |
| Restrictions through Buffer | Over-limit posts are rejected up front with a clear error. |

### YouTube  [channel `youtube_main` — channel; must be the channel owner]

| | |
|---|---|
| Shorts | ✅ auto-publish. **9:16 or 1:1**, **≤ 3 min**, ≤ 10 GB, `.mp4`/`.mov`/`.mpg`/`.mpeg`/`.avi`/`.WebM`. |
| Long-form | **Not built this phase** — Shorts only. |
| Direct publishing | ✅ (must be logged in as the channel owner; brand-account *managers* cannot connect). Auto-publish can't use YouTube's audio library. |
| Title | `metadata.youtube.title` — **≤ 100 chars** (first ~40 shown in the Shorts feed). Auto-syncs from the first caption line if omitted; we set it explicitly. |
| Description | the main `text` field — **≤ 5 000 chars**; first 3 lines shown by default. |
| Hashtags | typed into the description; hyperlinked on publish. |
| `metadata.youtube` | `title`, `privacy: YoutubePrivacy` (`private`\|`public`\|`unlisted`), `madeForKids`, `notifySubscribers`, `categoryId`, `license`. |

**Net:** Buffer is one scheduling/autopost layer for all four networks.
Instagram needs **no Facebook Page** to publish. Hard account
requirements: IG Business/Creator, TikTok Business, YouTube channel-owner
login.

---

## 2. Auth & channels  [RESOLVED 13E.5B]

`BUFFER_ACCESS_TOKEN` is set in `.env.local` (git-ignored, server-side
only — never printed). `npm run social:publish -- channels` ran
2026-09-07; `lib/social/distribution/channels.json` now holds:

| alias | service | Buffer channel id | account | type |
|---|---|---|---|---|
| `instagram_main` | instagram | `6a9e047acd8b9c702c1dd923` | pokemondealfinder | business |
| `tiktok_main` | tiktok | `6a9e06dccd8b9c702c1de017` | pokemondealfinder | account |
| `x_main` | twitter | `6a9e05d8cd8b9c702c1ddd50` | pkmdealfinder | profile |
| `youtube_main` | youtube | `6a9e079ccd8b9c702c1de219` | PokemonDeal Finder | channel |

Org id `6a9e03b7134a079a70e1b008`. All four channels are unlocked and
connected. Buffer auth is **healthy**. Channel ids are
account-identifying but not credentials; only `channels.json` and the CLI
read them. Without `BUFFER_ACCESS_TOKEN`, `getSocialProvider()` returns
the **null provider** and there is no code path from this repo to a
social network.

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
| `lib/social/distribution/channels.json` | logical alias → Buffer channel id — 4 platforms, **resolved 13E.5B** |
| `lib/social/distribution/platformCopy.mjs` | deterministic X post text + YouTube Short title/description (13E.5B) |
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
| `epn_compliance` | `SOCIAL_EPN_AI_CLASSIFICATION` is set to `NOT_APPLICABLE_CURRENT_PIPELINE` or `APPROVED` — an **owner/compliance classification**, NOT an eBay approval (13E.5D; see §6 + `docs/social-compliance-readiness.md` §4a). Default = unclassified → blocks. |
| `qa_pass` | the artifact variant's QA verdict is `ok` with an empty `failed[]`. |
| `rights_cleared` | the artifact's frozen `rights_state` is byte-identical to `lib/social/rights.mjs` **and** `ppt_social_data` + `card_image` are `CLEARED`. Rights drift = hard fail. |
| `owner_approval` | the ledger row is `APPROVED` (explicit, per-row). |
| `provider_auth` | a social provider is configured (`BUFFER_ACCESS_TOKEN`). |
| `channel_resolved` | the row's platform maps to a real Buffer channel id in `channels.json`. |
| `placement_eligible` | `(family, media kind, platform)` is an approved placement (artifactMap). |
| `media_compatible` | media ratio / duration / item-count is inside the platform's accepted envelope. |
| `media_present` | the local media file exists **and** a frozen public HTTPS URL is set (13E.5C). Text-only X posts exempt. |
| `asset_not_drifted` | the local media's current sha256 still matches the hosted+frozen hash (13E.5C). |
| `caption_frozen` | caption is non-empty, carries the `Ad` disclosure, is **unchanged** vs the artifact, and within hashtag limits. |
| `deterministic_facts` | frozen `market_price`+`discount_pct` or `movement` on the row — or, for a 9:16 video, a passing video QA gate (which re-derives every on-screen number from the verified payload) — or `brand_ad`. |
| `freshness_at_send` **(13E.5D)** | for `deal_drop` / `hook_carousel` / `market_snapshot`: the frozen content snapshot is **live** (not a fixture) **and** ≤ `SOCIAL_FRESHNESS_MAX_AGE_HOURS` old *as of now* — a post that aged in the review queue past the ceiling is blocked and forces a re-source + re-render. `market_mover` (MARKET_DATA) and `brand_ad` are exempt. |
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
SOCIAL_EPN_AI_CLASSIFICATION=NOT_APPLICABLE_CURRENT_PIPELINE
#   ^ owner/compliance classification (13E.5D). NOT an eBay approval.
#     Set APPROVED only if a formal EPN AI Tools approval is actually filed.
```

Until it is set, `epn_compliance` blocks every `send`. It is an INTERNAL
owner/compliance classification and does NOT represent, imply, or claim any
approval from eBay/EPN. The current pipeline sends only DATA-FREE
background instructions to OpenAI (no eBay listing data / prices / seller
data / seller images / affiliate data / customer data); real card art +
all factual overlays are composited deterministically; the promoted
destination is PokemonDealFinder.com. Full evidence: `docs/social-compliance-readiness.md` §4a.

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
npm run social:publish -- metrics <job_id>             READ-ONLY: pull provider metrics, append a snapshot (13E.7A)
npm run social:publish -- metrics-batch <batch_id>     READ-ONLY: metrics for every placement in a batch (13E.7A)
npm run social:publish -- review-pack                  build the dry-run distribution review pack

npm run social:metrics  -- sync                        READ-ONLY: snapshot every PUBLISHED/QUEUED placement (13E.7A)
npm run social:metrics  -- report                      per-placement performance dashboard (13E.7A)
npm run social:metrics  -- baseline                    show the pre-live NOT_AVAILABLE_YET baseline
```

`<platform>` = `instagram_feed` | `instagram_carousel` | `instagram_reel`
| `tiktok` | `x_post` | `youtube_short`. `<id>` = a `content_id`, a
`<source>/<family>` key (e.g. `video:13e4/deal_drop`), or a daily
`content_type` (e.g. `deal_of_day`).

`send` additionally refuses, past the gate stack, if the null provider is
active or `RIGHTS_STATE.publishing != ALLOWED` (defence in depth).

### Test mode  [IMPLEMENTED]

Default safety is **non-publishing**, enforced by *four* independent
signals that must ALL be flipped:
`RIGHTS_STATE.publishing = ALLOWED` **and** `SOCIAL_PUBLISH_ENABLED=true`
**and** `SOCIAL_PUBLISH_DRY_RUN=false` **and** `SOCIAL_EPN_AI_CLASSIFICATION` set
— plus a configured provider and a resolved channel. A developer who runs
`social:publish send` by accident gets a printed list of blockers and
exit 1; nothing leaves the machine.

---

## 8. Platform content strategy + artifact mapping  [IMPLEMENTED]

Deterministic, in `lib/social/distribution/artifactMap.mjs`. Nothing goes
to every platform.

| Creative family | media kind | eligible placements |
|---|---|---|
| `deal_drop` | `image_45` (4:5 still) | `instagram_feed`, `x_post` |
| `deal_drop` | `video_916` (9:16) | `instagram_reel`, `tiktok`, `youtube_short` |
| `deal_drop` | `text_only` | `x_post` (concise real-data text) |
| `market_mover` | `image_45` | `instagram_feed`, `x_post` |
| `market_mover` | `video_916` | `instagram_reel`, `tiktok`, `youtube_short` |
| `market_mover` | `text_only` | `x_post` |
| `hook_carousel` | `carousel_45` (≤10) | `instagram_carousel` |
| `hook_carousel` | `video_916` | `instagram_reel`, `tiktok`, `youtube_short` |
| `brand_ad` | `image_45` | `instagram_feed`, `x_post` |
| `brand_ad` | `video_916` | `instagram_reel`, `tiktok`, `youtube_short` |
| `market_snapshot` | `image_45` / `text_only` | `instagram_feed`, `x_post` |

Deliberate exclusions: TikTok / YouTube take **video only** (no
static-image workaround); a `hook_carousel` never becomes an `x_post`
(no honest single-fact text form — the 9:16 motion cut carries it); a
`market_snapshot` is never a video (it is an aggregate view).

Media envelopes (independent second guard):

- IG feed / carousel image: 3:4 – 1.91:1; carousel 2–10 slides.
- IG Reel: 4:5 – 9:16, ≤ 1920 px wide, 3 s – 15 min.
- TikTok: vertical, 3 s – 10 min.
- **YouTube Short: 9:16 or 1:1, 1 s – 180 s (3 min).**
- **X: text ≤ 280 chars (standard account); ≤ 4 images.**

`youtube_short` and `x_post` reuse the **existing 13E.4 9:16 master** —
no new render. X text posts carry no media file.

---

## 9. Metadata / caption contracts  [IMPLEMENTED]

`prepare` **freezes** the platform-appropriate copy + a `snapshot` of the
deterministic facts (`market_price`, `discount_pct`, or `movement`) onto
the ledger row. `send` re-reads the artifact and `caption_frozen` fails
if anything drifted. Nothing is regenerated at publish time — no LLM, no
factual drift.

| field | source | notes |
|---|---|---|
| `instagram_caption` | `lib/social/caption.mjs` (unchanged) — daily `caption-instagram.txt` or the 13E.4 manifest | disclosure line required; ≤ 5 inline hashtags |
| `tiktok_caption` | `lib/social/caption.mjs` (unchanged) — `caption-tiktok.txt` or manifest | shorter hook-driven variant |
| `x_post_text` | `lib/social/distribution/platformCopy.mjs` → `xPostText(facts)` | ≤ 280 chars; DEAL / MARKET templates; falls back to a shorter form, then to a hook-only line; `{ ok:false }` if it can't fit → that placement is blocked, others unaffected |
| `youtube_title` | `platformCopy.youtubeShortsMeta(facts).title` | ≤ 100 chars; `"$700 Pokemon Card Listed for $187"` / `"Ditto: Market Reference Up 37% (90d)"` style |
| `youtube_description` | `platformCopy.youtubeShortsMeta(facts).description` | ≤ 5 000 chars; fact line + CTA + "Prices and availability can change." + full disclosure + `#PokemonCards #PokemonTCG` |

The `facts` object is assembled once per variant
(`lib/social/distribution/artifacts.mjs`): from the daily payload
`snapshot` when present, otherwise by **parsing the 13E.4 manifest's own
frozen fact sentence** (a byte-stable `caption.mjs` template — re-reading
our own text, never inventing a number). Every platform's copy for one
content piece therefore carries the **same** listed price / market
reference / discount / movement. If the numbers can't be recovered, the
X/YouTube copy is `{ ok:false }` and only that placement is blocked.

### X templates (§6)

```
DEAL      Just found: {card}          MARKET   {card}: market reference moved
          Listed: {listed}                     {dir} {pct}% over {window}.
          Recent market ref: {ref}
          {pct}% below reference               Price history:

          {url}                                {url}

          Ad · eBay Partner Network affiliate   Ad · eBay Partner Network affiliate
```

No thread generation. No automated replies. No engagement bait — every
value comes from the frozen `facts`.

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

## 12. First dry-run 4-platform review pack

`npm run social:publish -- review-pack` →
`.social-preview/distribution-review-pack/manifest.json`.

It builds these placements from the current artifacts, gates each, and
persists nothing to the ledger:

| # | placement | source | copy | would send |
|---|---|---|---|---|
| 1 | Instagram — Deal Drop static (feed) | `social:daily` | IG caption | UNAVAILABLE (daily pool thin — 0 selected) |
| 2 | Instagram — Hook Carousel (carousel) | `social:daily` | IG caption | UNAVAILABLE (same) |
| 3 | Instagram — Deal Drop Reel (9:16) | 13E.4 `deal_drop_reel.mp4` | IG caption (484 ch) | **NO** — publish_switch, live_mode, epn_compliance, owner_approval |
| 4 | TikTok — Deal Drop (9:16) | 13E.4 `deal_drop_tiktok.mp4` | TikTok caption (375 ch) | **NO** — same 4 |
| 5 | X — Deal Drop (text) | 13E.4 deal_drop facts | `x_post_text` **151 ch** | **NO** — same 4 |
| 6 | X — Market Mover (text) | 13E.4 market_mover facts | `x_post_text` **132 ch** | **NO** — same 4 |
| 7 | YouTube Short — Deal Drop | 13E.4 `deal_drop_reel.mp4` | title `"$141 Pokemon Card Listed for $40"` (32 ch) + desc (349 ch) | **NO** — same 4 |
| 8 | YouTube Short — Market Mover | 13E.4 `market_mover_reel.mp4` | title `"Ditto: Market Reference Up 37% (90 days)"` (40 ch) + desc (360 ch) | **NO** — same 4 |

Channels for 3–8 are now **resolved** and the provider is **configured**,
so `provider_auth` and `channel_resolved` pass; the only blockers left are
the four the owner must flip (publish_switch, live_mode, epn_compliance,
owner_approval).

The static IG still + carousel (1, 2) come from `social:daily`; when the
deal pool is thin that command selects **0** posts and those slots report
`UNAVAILABLE` — the correct fail-closed outcome.

> **Known 13E.4-artifact issue (not a distribution bug):** the frozen IG
> caption in the 13E.4 manifest contains the line *"Verification age
> outside social freshness threshold - not eligible for preview."* — a
> stale `freshness.label` from when those masters were rendered. The
> distribution layer faithfully carries what 13E.4 produced;
> `social:video` should be re-run before any real send.

---

## 13. Public media hosting  [IMPLEMENTED 13E.5C]

Buffer fetches assets from a **public URL** — it does no direct upload. So
approved rendered media is uploaded to public storage first, and the
distribution row freezes that URL.

### Storage provider — Supabase Storage  [chosen]

**Why:** it is already the project's database. `@supabase/supabase-js` is
a dependency; `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are
already configured. **No new account, no new paid infrastructure.** No
`@vercel/blob` / `BLOB_READ_WRITE_TOKEN` was present; the Vercel CLI is
not installed. A public bucket serves a stable, unauthenticated HTTPS URL
with the correct `Content-Type` — exactly what Buffer needs.

Bucket **`social-public`** (created once, 13E.5C):
`public: true`, per-file limit **25 MB**, MIME allow-list
`image/png, image/jpeg, video/mp4`. Public URL shape:
`<SUPABASE_URL>/storage/v1/object/public/social-public/by-hash/<sha256>.<ext>`.

### Architecture  [IMPLEMENTED]

```
approved local artifact → sha256 → canHost() gate → STORAGE.upload() (upsert:false)
   → immutable public URL → hosted-asset record (hosted-assets.json)
   → prepare freezes { hosted_asset_id, public_media_url, media_sha256 } onto the ledger row
   → Buffer adapter reads row.public_media_url  (NO upload at send time)
```

- `lib/social/storage/supabase.mjs` — the adapter (`upload`, `head`,
  `probeRange`, `listKeys`, `remove`). The renderer imports none of this.
- `lib/social/storage/index.mjs` — `getStorageProvider()`; **null
  provider** default (refuses every call) when the env is absent.
- `lib/social/storage/hostedAssets.mjs` — the record shape + store
  (`hosted-assets.json`), `sha256`, `storageKeyFor`, `canHost`,
  `assetMatches` (drift), `cleanupCandidates` (retention).
- CLI: `social:publish -- host` / `verify-hosts` / `hosts`.

### Object naming + checksum / dedupe  [IMPLEMENTED]

The storage key **is** the content hash: `by-hash/<sha256>.<ext>`. So:

- **Identical bytes → identical key → one object, one record** (dedupe;
  `upsert:false`, "already exists" is treated as success).
- **Any change → a new sha → a NEW immutable object.** An already-hosted
  object is **never overwritten in place**, so a frozen social post can
  never suffer asset drift.

### Rights / QA gate before upload  [IMPLEMENTED]

`canHost()` allows a host **only if** QA is `ok` with an empty `failed[]`,
the artifact's frozen `rights_state` still matches `lib/social/rights.mjs`
**and** `ppt_social_data` + `card_image` are `CLEARED`, the MIME is on the
allow-list, the file is ≤ 25 MB, and the path is not a secret / config /
manifest / log / `supabase/` / **eBay-seller-image** path. `publishing:
DISABLED` does **not** block a host — **hosting is not publishing.**

### Public URL verification  [IMPLEMENTED]

After upload, `host` (and `verify-hosts`) issues a `HEAD` + a `Range: 0-4095`
`GET` and records: HTTP status (must be `200`), `Content-Type` (must match
the media class), `Content-Length` (must be within 1 KB of the local
bytes), no `WWW-Authenticate` / 401 / 403, and `Accept-Ranges` for MP4
seek compatibility. No `createPost` call is made.

### Ledger integration + asset-drift guard  [IMPLEMENTED]

`prepare` freezes `hosted_asset_id`, `public_media_url`, `media_sha256`
onto the row. Gate **`media_present`** now requires a real `https://`
`public_media_url` for every media placement (text-only X posts are
exempt). Gate **`asset_not_drifted`** re-reads the local media at
`dry-run` / `send` and fails if its sha256 no longer matches the frozen
hash — forcing a re-host + re-approve; media is **never silently
replaced**.

### Retention policy  [IMPLEMENTED — conservative]

`cleanupCandidates()` will **never** return an asset referenced by a
`QUEUED` or `PUBLISHED` ledger row. Only orphan rows older than 30 days
are even offered. There is **no automatic deletion** — a human runs it.

### First hosted review pack

`social:publish -- host` then `social:publish -- review-pack` — see the
FINAL REPORT for the run captured this phase. Every media placement then
carries its real Supabase public URL; every item still says
`would_send = NO` (live gates closed).

---

## 13a. Fresh content source + the freshness contract  [IMPLEMENTED 13E.5D]

### Why the live social pool is thin (diagnosis)

`social:daily` and `social:source -- live` currently select **0** posts.
Traced through the live pool (663 active English deals, one Supabase read):

| filter | survivors |
|---|---|
| `isDisplayableDeal` (the site's own display gate) | 646 |
| + BIN only (auctions are out of social MVP scope) | 404 |
| + valid `market_price` **and** positive `discount_pct` | 404 |
| + `exact_verified_at` within **6 h** (social ceiling) | **0** |
| + `exact_verified_at` within **12 h** (the *site's* premium bound) | **0** |
| `isPremiumDealEligible` (site flagship gate) over the whole pool | 17 — but **0** are BIN-with-a-real-discount (all auctions / no discount) |

**Primary cause:** `exact_verified_at` is stale pool-wide — the freshest
in the active pool is ~8 h old. `exact_verified_at` is written only by the
`app/api/verify-deals` cron on a positive single-item eBay confirmation;
that cron is behind, and the eBay Browse quota is exhausted until the next
daily reset (the P0 image-recovery job is waiting on the same reset), so
it can't be forced now without disturbing that job. This starves the
**site's** premium sections too, not just social. Re-run
`social:source -- live` once `verify-deals` catches up.

### Was a social-only gate too strict? (§2)

Yes, one: `SOCIAL_FRESHNESS_MAX_AGE_HOURS = 6` is **half** the site's own
`PREMIUM_EXACT_VERIFICATION_MAX_AGE_HOURS = 12`. It is a
**CREATIVE_PREFERENCE / operational margin** (documented: "a social
preview can sit in a human-review queue"), not a truth requirement — the
site itself treats a 12 h-verified premium deal as fresh. It was **left
unchanged this phase** (relaxing it changes nothing today: 0 qualifying
BIN deals in the 6–12 h window either), and the review-queue-latency risk
it was compensating for is now handled *properly* by the new
`freshness_at_send` gate. Recommendation for the owner: consider aligning
it to 12 h now that the send-time re-check exists.

### Gate classification (§2)

| gate | class | may relax? |
|---|---|---|
| actual deal qualification (`isDisplayableDeal`, `isPremiumDealEligible`, P0.3 match integrity, active-listing, language/grade/multi-card, exact printing, reference confidence) | MANDATORY_TRUTH / MANDATORY_QUALITY | **never** — untouched, a wrapper not a fork (`lib/social/eligibility.mjs`) |
| `exact_verified_at` present + within a real ceiling; `socialFreshnessLine` fail-closed | MANDATORY_TRUTH | never |
| `RIGHTS_STATE` (`ppt_social_data`, `card_image`, `ebay_seller_images`, `ebay_genai`, `publishing`) | MANDATORY_RIGHTS | never |
| canonical card-art requirement (`cardArtwork.mjs`, fail closed on wrong/missing printing) | MANDATORY_QUALITY | never |
| BIN-only (auction wording UI not built) | MANDATORY_QUALITY (MVP scope) | not this phase |
| `SOCIAL_FRESHNESS_MAX_AGE_HOURS = 6` (vs the site's 12) | **CREATIVE_PREFERENCE** | yes, with evidence — left at 6 this phase; owner may align to 12 |
| every family present every run | **CREATIVE_PREFERENCE** | already graceful — `tryProduce` skips a family that can't produce; the run never aborts |
| carousel needs ≥ N distinct cards | MANDATORY_TRUTH (the "N cards" claim) | never — a shorter truthful carousel is fine, a false count is not |

### The freshness contract

One authoritative definition, from real stored timestamps only —
**never render/wall-clock time**:

- **authoritative field:** `exact_verified_at` (P0.2 — a positive
  single-item eBay confirmation only).
- **ceiling:** `SOCIAL_FRESHNESS_MAX_AGE_HOURS`.
- **states** (`lib/social/eligibility.SOCIAL_FRESHNESS_STATE`):
  `JUST_FOUND` (the unchanged just-found rule), `FRESH` (verified within
  the ceiling), `MARKET_DATA` (Market Mover — truth is confident price
  history, not per-listing freshness; no "checked" line, no ceiling).
- **fail closed:** `socialFreshnessLine()` on a row past the ceiling
  returns `{ renderable:false, label:null }`; `baseFreshness()` in
  `payload.mjs` **throws**; the render pipeline catches it and **skips the
  family** — a creative with placeholder freshness copy can never be
  produced (regression test `social-freshness-13e5d`).
- The old debug string *"...not eligible for preview."* is **removed**
  from every production code path.

### `npm run social:source`  [IMPLEMENTED]

Freezes a real eligible content snapshot to
`.social-preview/source/live-snapshot.json` — the deterministic input to
`social:video` (and, later, `social:daily`).

```
npm run social:source -- live          pull from the live DB (one Supabase read, NO eBay calls)
npm run social:source -- from-fixture  wrap the committed test fixture in the snapshot contract (NON-LIVE)
npm run social:source -- show          print the current snapshot
```

- Keeps only rows that pass the **unchanged** eligibility gates
  (`socialBinPool`).
- Freezes each row's real `exact_verified_at` / `first_seen_at` /
  `last_seen_at`, its source deal id and tcgplayer id, and `captured_at`.
- **Never fabricates inventory:** 0 eligible → an explicit `empty: true`
  snapshot with a machine-readable `empty_reason`. **Never** overwrites
  `tests/fixtures/`.
- `social:video` judges freshness **as of `captured_at`**, records
  `source` / `source_captured_at` / `source_is_live` in its manifest, and
  the distribution layer's `freshness_at_send` gate re-checks *as of now*.

---

## 13b. First-live batch workflow  [IMPLEMENTED 13E.6A]

A **batch** is a signed-off launch plan for one `content_id` across a
chosen set of platform placements — NOT a publisher.
`lib/social/distribution/batch.mjs` + `revalidate.mjs`; store
`batches.json` (committed empty). Step-by-step operator guide:
**`docs/first-live-social-runbook.md`**.

```
prepare-batch <content_id> [--platforms instagram,tiktok,x,youtube] [--order …] [--schedule now|<iso>]
review <batch_id>            per-placement: media/copy/CTA/freshness/QA/rights/duplicate/drift/READY + summary
approve-batch <batch_id>     freezes exact placements + copy + artifact hashes + facts; stamps an approval CHECKSUM. Does NOT publish.
send-batch <batch_id> --confirm-live   HARD-FAILS without the flag; HARD-FAILS unless every live switch is set;
                            per-placement revalidate → submit in send order; one failure never stops the others
retry <job_id> --confirm-live    FAILED row only; same batch; re-runs every gate; refuses a double-submit
sync-batch <batch_id>       polls Buffer per QUEUED placement; QUEUED→PUBLISHED only on real sent+sentAt evidence
batches                     list
```

- **Approval checksum:** any post-approval edit (copy, media hash, added
  placement, schedule) invalidates it — `send-batch` refuses until re-approval.
- **Send order (§7):** `x_post → instagram_reel → instagram_feed → instagram_carousel → tiktok → youtube_short`.
- **Pre-send revalidation** (`revalidate.mjs`) runs the full gate stack
  **plus**: batch approval still valid, row copy byte-identical to the
  frozen copy, hosted asset sha matches the approved artifact,
  **fact-drift** policy (§6 — see the runbook table), channel re-resolve.
  Copy is **never** mutated at send time.
- **Partial failure:** verdict `PARTIAL_SUCCESS` / `ALL_QUEUED` /
  `ALL_FAILED`; published/queued placements are never auto-deleted; a
  `FAILED` placement needs an explicit `retry`.
- **Live confirmation:** four independent env/rights switches **and** an
  approved untampered batch **and** the literal `--confirm-live` flag.
  Running `send-batch` by accident cannot publish.
- **Observability:** batch `history[]` + ledger `history[]`/`sendLog[]`
  record created / approved / submitted / provider-ref / queued /
  published / failed / retry / sync — no tokens, no secrets.
- **Reserved for later** (ledger row): `platform_post_url`, `metrics.*`,
  `last_metrics_sync` — populated from Buffer's read-only metrics API
  (`aggregatedPostMetrics` / `post.metrics`), no scraping.

---

## 14. Autopilot — design only  [FUTURE — NOT BUILT]

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

## 15. What is NOT done / remaining live blockers

**LIVE GATE CLOSED** (owner action, none flipped this phase):

1. `SOCIAL_EPN_AI_CLASSIFICATION` — the owner sets this env to
   `NOT_APPLICABLE_CURRENT_PIPELINE` (data-free GenAI boundary; the
   evidence + rationale is written in `docs/social-compliance-readiness.md`
   §4a — 13E.5D swapped the old hard `EPN_AI_TOOLS_APPROVED` flag for this
   classification, which does **not** claim any eBay approval).
2. `RIGHTS_STATE.publishing` → `"ALLOWED"` (one reviewed line).
3. `SOCIAL_PUBLISH_ENABLED=true` **and** `SOCIAL_PUBLISH_DRY_RUN=false`.
4. A **fresh live content snapshot** — `social:source -- live` currently
   returns `empty` (0 rows exact-verified within the ceiling; the
   `verify-deals` cron is behind + Browse quota exhausted until the daily
   reset). `freshness_at_send` blocks every `deal_drop` / `hook_carousel`
   / `market_snapshot` placement until a live snapshot exists and
   `social:video` is re-run against it. `market_mover` (MARKET_DATA) is
   exempt.

Once 1–4 are done, `social:publish -- prepare … → approve … → send …`
runs the full gate stack; a green stack submits ONE Buffer lead per
platform → QUEUED, and `sync` promotes to PUBLISHED only on real
`sent` + `sentAt` evidence.

### PPT / EPN written-confirmation audit (§11, 13E.5D)

| item | required? | evidence | classification |
|---|---|---|---|
| PPT written confirmation for derived figures in social | was a pre-13E action note | `RIGHTS_STATE.ppt_social_data = "CLEARED"` (`lib/social/rights.mjs`, owner, 13E.1 2026-09-06); `docs/social-daily-workflow.md` §249 "Owner-confirmed (13E.1)". Scope: today's on-site market reference only — NOT PPT time-series / movers / grade-spreads. | **C — satisfied at the operative gate.** The pipeline reads `ppt_social_data`; it is CLEARED. Do not claim PPT emailed — the owner's recorded clearance is the gate; the distribution layer blocks any content whose `rights_state` drifts from it. |
| eBay "visually isolated" clause / seller-image confirmation | required **only** to composite eBay **seller** photos | `RIGHTS_STATE.ebay_seller_images = "NOT_CLEARED"` (unchanged); no `i.ebayimg` / seller path can reach a template, OpenAI, or the hosting layer (`social-*` tests; 13E.5C `canHost`). The render system uses canonical TCGplayer art only. | **D for the current pipeline — obsolete as a blocker** (the pipeline never touches seller images). Stays `NOT_CLEARED` as a permanent guard. It would be **A** only if a seller-image workflow were built. |
| EPN GenAI / "AI Tools" approval | required **only** if eBay data reaches a GenAI model | `docs/social-compliance-readiness.md` §5 governing principle + §4a; `lib/social/assetPrompts.mjs` sends only `{family,style,zone}` enums; `scripts/socialAssets.mjs` is the sole OpenAI call, image-only + data-free (tests 11 / 11b). | **D — obsolete as a hard blocker for this pipeline.** Replaced by `SOCIAL_EPN_AI_CLASSIFICATION=NOT_APPLICABLE_CURRENT_PIPELINE` (an internal classification, not an eBay approval). |

No external approval was invented. `RIGHTS_STATE` is unchanged.

**RESOLVED:**

- ~~Buffer API key + 4 channels~~ — done 13E.5B.
- ~~Public asset hosting~~ — done 13E.5C (Supabase Storage, `social-public`).
- ~~The debug `freshness.label` in the masters~~ — **13E.5D:**
  `socialFreshnessLine` now fails closed (`renderable:false`, `label:null`);
  the payload builder throws rather than emit placeholder copy; the
  removed string cannot reach a creative (regression test). The masters
  were re-rendered from a frozen snapshot judged as of its capture time,
  so the line now reads `Checked <real exact_verified_at> UTC. Availability
  can change.` — but the snapshot is a **fixture** (no fresh live data),
  so `freshness_at_send` still blocks the deal placements.
- ~~Old hard `EPN_AI_TOOLS_APPROVED` flag~~ — **13E.5D:** replaced by the
  `SOCIAL_EPN_AI_CLASSIFICATION` gate.

---

## 16. Performance tracking & attribution  [IMPLEMENTED 13E.7A]

Read-only measurement layer — see **`docs/social-performance.md`** for the
full contract. In brief:

- **Attribution** (`lib/social/distribution/attribution.mjs`): the one
  place that stamps first-party `utm_source` (platform) / `utm_medium=social`
  / `utm_campaign` (content goal) / `utm_content` (`content_id`) onto the
  on-site CTA. Deterministic, idempotent, no personal data, refuses any
  non-`pokemondealfinder.com` host. The batch freezes the attributed URL;
  `revalidate.mjs` byte-checks it. **eBay `campid` / `customid` unchanged.**
- **Metrics** (`lib/social/distribution/metrics.mjs`): timestamped
  snapshots on the ledger row. Missing metric → `null` (never `0`);
  platform can't report it → `—` (`unsupported`); sync error → keep last
  good snapshot. Buffer's post-metrics API is experimental — treated as
  best-effort. `PLATFORM_METRIC_SUPPORT` matrix per platform.
- **CLI**: `social:metrics -- sync | report | baseline`,
  `social:publish -- metrics | metrics-batch` — all READ-ONLY (no
  `createPost` path; `tests/scanner/social-performance-13e7a.test.mjs`
  asserts it).
- **First-live baseline**: every metric `NOT_AVAILABLE_YET` (nothing
  published).
- **EPN `customid`**: recommendation is to keep it coarse — do **not**
  encode `content_id`. No affiliate-URL change this phase.

**FUTURE (not built):**

- a true multi-slide 4:5 carousel *export* from `social:daily` (today it
  renders one representative still); `carousel_45` (≤ 10) is already modelled.
- the scheduler / autopilot policy engine (§14).
- X single-image posts, YouTube long-form, X threads,
  TikTok/YouTube notification-publish fallback.
- static IG feed / carousel + X image placements depend on `social:daily`
  selecting a post; when live inventory is thin it selects **0** and
  those placements report `UNAVAILABLE` (correct fail-closed).
