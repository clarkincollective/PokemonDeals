# Social Performance Tracking & Attribution — Phase 13E.7A

Read-only measurement layer that ties every future social placement back
to:

```
CONTENT  ->  PLATFORM POST  ->  WEBSITE VISIT  ->  DEAL CLICK / AFFILIATE OUTBOUND
```

Nothing here publishes, schedules, edits, deletes, comments, replies, or
DMs. It is infrastructure only. As of this phase **no social content has
been published**, so every platform metric is `NOT_AVAILABLE_YET` (§8).

Status labels: **[IMPLEMENTED]** · **[OWNER ACTION]** · **[FUTURE]**.

---

## 1. Provider metrics matrix  [VERIFIED PROVIDER FACT — live introspection 2026-09-07]

Buffer exposes read-only post metrics via GraphQL:

```graphql
query { post(input:{ id }) { metricsUpdatedAt metrics { name type unit value description } } }
query { aggregatedPostMetrics(input:{ organizationId, channelIds, startDateTime, endDateTime, tags })
        { metricsUpdatedAt metrics { name type unit value } } }
```

`PostMetricType` enum (the full set Buffer *can* return): `impressions
reach views likes comments shares saves clicks reposts quotes reactions
engagementRate averageTimeWatched totalTimeWatched viewers follows
postCount`. `PostMetricUnit`: `count | percentage`.

> **Buffer caveat (documented):** Buffer's post-metrics API is **early /
> experimental** and **personal-use only** (it reads with the account's
> own API key — which is exactly our setup). Buffer explicitly does *not*
> recommend relying on it for production reporting. Our code therefore
> treats it as best-effort: a returned value is real; an **absent metric
> is `null`, never `0`**; a sync error keeps the last good snapshot.

### Per-platform support

`SUPPORTED` = the platform reports it for an owned post **and** Buffer
maps it · `NOT_SUPPORTED` = the platform has no such metric ·
`UNKNOWN` = the platform has it but Buffer's experimental coverage is
unverified (treat a value as real, an absent one as `null`).

| metric | Instagram | TikTok | X | YouTube |
|---|---|---|---|---|
| impressions | SUPPORTED | UNKNOWN | SUPPORTED | UNKNOWN |
| reach | SUPPORTED | UNKNOWN | **NOT_SUPPORTED** | **NOT_SUPPORTED** |
| views | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| likes | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| comments | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| shares | SUPPORTED | SUPPORTED | **NOT_SUPPORTED** | SUPPORTED |
| saves | SUPPORTED | SUPPORTED | UNKNOWN | **NOT_SUPPORTED** |
| clicks | **NOT_SUPPORTED** | **NOT_SUPPORTED** | UNKNOWN | **NOT_SUPPORTED** |
| reposts (RT) | n/a | n/a | SUPPORTED | n/a |
| quotes | n/a | n/a | SUPPORTED | n/a |
| engagement_rate | SUPPORTED | UNKNOWN | UNKNOWN | UNKNOWN |
| average_time_watched | UNKNOWN | SUPPORTED | NOT_SUPPORTED | SUPPORTED |
| total_time_watched | UNKNOWN | SUPPORTED | NOT_SUPPORTED | SUPPORTED |
| viewers (unique) | UNKNOWN | SUPPORTED | NOT_SUPPORTED | NOT_SUPPORTED |
| follows (from post) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

Encoded in `lib/social/distribution/metrics.mjs` `PLATFORM_METRIC_SUPPORT`.
A `NOT_SUPPORTED` metric renders as `—` in every report — never `0`.

---

## 2. Post identity contract  [IMPLEMENTED — reuses existing ledger fields]

Every placement is already traceable through the distribution ledger row
(`lib/social/distribution/ledger.mjs`) + its batch
(`lib/social/distribution/batch.mjs`). No new identity system:

| field | where |
|---|---|
| `content_id` | ledger row + batch (`creativeSpec` deterministic id) |
| `batch_id` | batch record; row ↔ batch via `job_id` |
| `job_id` | `${content_id}::${platform}::${creative_variant}` |
| `platform` / `placement` | ledger row |
| `provider_ref` | ledger row (Buffer post id, set on QUEUED) |
| `platform_post_url` | ledger row — set **only** from provider evidence on PUBLISHED (`post.externalLink`); never scraped |
| `creative_family` / `content_goal` | ledger row + artifact |
| `hook_variant` / `cta_variant` | `creativeSpec.buildCreativeIdentifiers` (reserved; `null` until an experiment sets them) |
| source deal / card | ledger row `snapshot` + batch `source_snapshot_id` / `source_captured_at` |
| `published_at` | ledger row — provider timestamp only |

---

## 3. Website attribution — the UTM contract  [IMPLEMENTED]

`lib/social/distribution/attribution.mjs` is the **one** place that stamps
first-party campaign parameters onto a social CTA. Deterministic — the same
`(baseUrl, platform, goal, content_id)` always yields the same URL.

```
https://pokemondealfinder.com/<real deep link>
  ?utm_source=<instagram|tiktok|x|youtube>     # the platform
  &utm_medium=social                            # constant
  &utm_campaign=<reach|engagement|trust|conversion|brand>   # content_goal, lower-cased
  &utm_content=<content_id>                     # deterministic creative id
```

- **Platform-specific**: `utm_source` from `PLATFORM_UTM_SOURCE`.
- **Content-specific**: `utm_content` is the `creativeSpec` `content_id`
  — a coarse creative id (`family + type + subject-slug + date + variant
  + short hash`). **No personal data**: never a user/session id, never a
  card/deal/listing/TCGplayer id, never a price. Validated against a
  conservative token regex (mirrors `lib/analytics/props.js`
  `sanitizeUtmValue`); a value that fails is simply omitted (fail closed),
  never emitted dirty.
- **Deterministic + idempotent**: built with `URLSearchParams.set()` — re-
  stamping an already-stamped URL replaces each param (exactly one of
  each survives).
- **First-party only**: the params land on our own canonical deep link.
  `attributedCtaUrl()` **hard-refuses** any non-`pokemondealfinder.com`
  host, so it structurally cannot stamp an eBay / affiliate URL.
- Wired in `scripts/socialPublish.mjs` `buildRow()` (row `cta_url`) and
  `lib/social/distribution/artifacts.mjs` (the URL embedded in X post text
  and the YouTube description). The batch freezes the attributed URL in
  `frozen_copy.cta_url`; `revalidate.mjs` byte-checks it before any send.
- **X budget note**: the attributed URL is ~100 chars. `xPostText()`
  already tries a full form → a tight form → drops the disclosure → and
  finally returns `{ ok:false }` (the gate then blocks *that* placement
  only). A very long subject slug can therefore make an X placement fail
  closed — shorten the subject or omit X for that content.

### Does NOT alter eBay affiliate attribution

The EPN path (`campid` / `customid` via `lib/affiliateSurfaces.js` +
`wrapEbayAffiliateUrl`) is **completely separate and byte-unchanged** by
this phase. UTMs are on the *website* link the social post points at; the
eBay link the visitor clicks *later on the site* still gets its `campid`
(unchanged) and its coarse-surface `customid` exactly as before.

---

## 4. Website-first CTA  [PRESERVED]

```
SOCIAL POST  ->  PokemonDealFinder.com (attributed)  ->  visitor picks an eBay listing  ->  EPN affiliate click
```

Unchanged. Social posts are **never** turned into direct eBay affiliate
links. Social acquisition (UTM) and the final EPN click (`campid` /
`customid`) are tracked as two separate things that can be *compared* in
aggregate later without ever joining on a user or session.

---

## 5. Current website analytics stack  [AUDIT]

| piece | state |
|---|---|
| **PostHog** | Installed + configured (`lib/analytics/*`). PostHog Cloud **EU**, `cookieless_mode: "always"`, `persistence: "memory"`, `person_profiles: "never"`, autocapture / replay / heatmaps / surveys **off**, explicit custom events only, `before_send` PII/URL scrubbers, respects DNT / GPC. Inert no-op unless `NEXT_PUBLIC_POSTHOG_KEY` is set. |
| **Vercel Web Analytics** | Connected; `@vercel/analytics` `track()` fires alongside PostHog from `components/AffiliateLink.js` and the homepage markers. |
| **Event taxonomy** | `lib/analytics/events.js` — frozen snake_case allowlist. |

### Events that already exist

| need | event | notes |
|---|---|---|
| page_view | `homepage_view`, `card_viewed_from_home`, `deal_viewed_from_home` | explicit; no auto pageview |
| deal_view | `deal_viewed_from_home`, `qualified_detail_view` (~10s dwell) | |
| deal_click | `best_deal_clicked` / `ending_soon_clicked` / `just_added_clicked` / `most_active_clicked` | lane → detail |
| affiliate_outbound | **`affiliate_click`** | fired by `AffiliateLink`; carries `content_id`, `deal_id`, `origin_section`, `rank`, `listing_type`, `raw_vs_graded`, `price_band_usd`, `discount_band`, `country` |
| search / filter | `search_*`, `filter_*`, `sort_changed`, `country_changed` | |
| newsletter signup | — | **GAP**: no signup event in the taxonomy |
| social referrer / UTM | `readLandingAttribution()` in `lib/analytics/session.js` seeds `utm_source/medium/campaign/content` + `traffic_source` into the **in-memory common context** (`AnalyticsBootstrap`), so **every** event — including `affiliate_click` — is tagged with the social campaign when the landing URL carried it. `props.js` `classifyTrafficSource` already maps instagram / tiktok / youtube / x referrers. | see gaps |

### Gaps

1. **Nothing emits UTMs yet** — until 13E.7A there was no social CTA
   producing `utm_*`, so the capture path had nothing to capture. Fixed
   upstream by §3 (the distribution layer now stamps them).
2. **Full-page-reload drops in-memory UTM context.** The analytics posture
   *forbids* cookies / localStorage / sessionStorage
   (`tests/scanner/analytics-no-storage.test.mjs`). Landing attribution
   lives only in memory for the page's event stream; a hard reload before
   the affiliate click loses it. This is the **documented, accepted 13A
   trade-off** — same-session association is done in PostHog analysis on
   `utm_content`, not reconstructed client-side. **No storage was added.**
3. **No newsletter-signup event.** Out of scope here; noted for a future
   analytics pass.
4. **No server-side PostHog read wiring.** KPI columns that need a website
   denominator (website CTR, affiliate-outbound rate) are fed from an
   *owner-provided export* (§7), not a live API call from this layer.

---

## 6. Social landing context  [IMPLEMENTED — no new code, no new storage]

On a visit whose URL carries `utm_*`, `readLandingAttribution()` already
captures `source` / `medium` / `campaign` / `content` and a derived
`traffic_source`, and `AnalyticsBootstrap` seeds them into the in-memory
common context. Persistence is **session-scoped in memory only** — no
cookie, no localStorage (posture requirement). Nothing personal is
collected: the four `utm_*` codes are coarse campaign tokens, sanitised by
`sanitizeUtmValue`.

---

## 7. Affiliate-outbound attribution  [IMPLEMENTED via existing event]

When a socially-attributed visitor clicks an eBay CTA, `AffiliateLink`
fires `affiliate_click`. Because the common context already carries
`utm_source` / `utm_campaign` / `utm_content` / `traffic_source`, that
`affiliate_click` **already** carries the social attribution — no new
event needed. Properties on it: `content_id` (the deal), `deal_id`,
`origin_section`, `price_band_usd`, `discount_band`, `country`, plus the
common `utm_*`.

- **Internal analytics and affiliate tracking stay conceptually
  separate.** The custom `affiliate_click` props are **not** sent to eBay.
  `campid` / `customid` on the outbound eBay URL are the only things eBay
  sees, and they are unchanged (§3, §8).
- **KPI denominators** (`attributed_site_visits`, `affiliate_outbound`)
  are supplied to `computeKpis()` from an optional owner export at
  `.social-preview/metrics/attribution-import.json`, keyed by
  `content_id`, produced from PostHog filtered on `utm_content`. No
  scraping, no analytics API call from this layer. Absent file → those
  KPI columns show `·` (no reading), never `0`.

---

## 8. EPN `customid` recommendation  [RECOMMENDATION ONLY — no code change this phase]

**Question (§8):** encode social source/content into the eBay affiliate
`customid` (e.g. `ig_<content_id>`)?

**Recommendation: do NOT.** Keep `customid` coarse.

- `lib/affiliateSurfaces.js` is deliberately a **closed `Set` of literal
  strings** (`home_best`, `deals`, `card`, …, `other`). Its whole safety
  property is that no caller-supplied value is ever concatenated into what
  reaches eBay. `ig_<content_id>` breaks that guarantee and puts an
  unbounded, per-creative cardinality into EPN reporting.
- `docs/ebay-affiliate-attribution.md` already rules out per-card /
  per-listing / per-content granularity and any PostHog ↔ EPN crossover.
- Content-level attribution is fully covered by `utm_content=content_id`
  on the *website* link + the internal metrics ledger. EPN does not need
  it.
- **If** coarse platform-level EPN attribution is later wanted, the safe
  minimal change is to add **one** reserved value `social` (or at most
  `social_instagram` / `social_tiktok` / …) to `AFFILIATE_SURFACES` —
  still a closed set, still no `content_id`, mapped only where a social
  CTA actually renders. That is a deliberate future step, not done here.

**This phase makes no change to affiliate URL generation.** `campid`,
`customid`, and every existing affiliate URL are byte-identical.

---

## 9. Metrics snapshot model  [IMPLEMENTED]

`lib/social/distribution/metrics.mjs`. Each ledger row carries:

```
metrics            newest reading — every METRIC_KEYS key present; null = "no reading" (NOT 0)
metrics_snapshots  [{ captured_at, source, provider_metrics_updated_at, metrics, unsupported[], units{} }]
metrics_error      { at, reason, detail } | null  — last good snapshot is retained on error
last_metrics_sync  UTC ISO | null
```

- `normalizeProviderMetrics(raw, platform)` maps Buffer's `PostMetric[]`
  onto `METRIC_KEYS`. A value of `0` is kept (real reading). A metric the
  payload omits stays `null`. A metric the platform **cannot** report is
  forced `null` and listed in `unsupported`.
- `attachSnapshot(row, snapshot)` appends history and refreshes the flat
  `row.metrics`. On `snapshot.error` it appends **nothing** — the last
  good snapshot stays, only `metrics_error` + `last_metrics_sync` update.
- `baselineMetrics()` → every key `NOT_AVAILABLE_YET` (§15).

---

## 10. Metrics sync  [IMPLEMENTED — READ-ONLY]

```
npm run social:metrics -- sync              # every PUBLISHED/QUEUED placement -> one snapshot
npm run social:metrics -- report            # the dashboard (§16)
npm run social:metrics -- baseline          # show NOT_AVAILABLE_YET baseline

npm run social:publish -- metrics <job_id>       # one placement, read-only
npm run social:publish -- metrics-batch <batch_id>
```

All of these call **only** `PROVIDER.getPostMetrics` /
`getAggregatedMetrics` / `getPostStatus`. There is no code path from any
of them to `createPost` / `updatePost` / `deletePost` / schedule /
comment / reply / DM. `tests/scanner/social-performance-13e7a.test.mjs`
asserts the metrics files reference no mutating provider method.

Provider error handling: retain the last known snapshot, record
`metrics_error`, **never** fabricate zeros.

---

## 11. Reporting windows  [IMPLEMENTED]

`REPORTING_WINDOWS` = `1h`, `24h`, `72h`, `7d`, `28d`. A post is reported
on with whatever windows its snapshots cover — none is required.
`snapshotForWindow()` picks the newest snapshot within a window;
`availableWindows()` lists the windows that currently have data. Multiple
snapshots accumulate over time.

---

## 12. Normalised KPIs  [IMPLEMENTED]

`computeKpis(metrics, { attributedVisits, affiliateOutbound })`. Each KPI
returns `null` unless **both** its inputs are real numbers, and carries
the denominator it used (`basis`) so a reader never assumes cross-platform
comparability.

| KPI | formula | denominator label |
|---|---|---|
| engagement rate | provider value if present, else `engagements / (reach ‖ impressions)` | `provider_reported` \| `reach` \| `impressions` |
| click-through rate | `clicks / impressions` (only where both exist) | `clicks / impressions` |
| website CTR | `attributed_site_visits / platform impressions` | `attributed_site_visits / impressions` |
| affiliate outbound rate | `affiliate_outbound_clicks / attributed_site_visits` | `affiliate_outbound / attributed_site_visits` |

`engagements = likes + comments + shares + saves + reposts + quotes` — but
only the ones actually reported; if none, `null` (not `0`).

---

## 13. Content performance  [IMPLEMENTED — comparison keys]

The ledger + batch already carry every dimension needed to compare:
`creative_family`, `content_goal`, `hook_variant`, `cta_variant`,
`platform`, `placement`. Once real snapshots exist, `social:metrics --
report` groups by platform and family; deeper slicing (which hook drives
reach, which CTA drives site visits, which family drives affiliate clicks,
which platform wins for Deal Drops vs Market Movers) is a query over
`metrics_snapshots` + the `attribution-import.json` export. **No automatic
optimisation** — reporting only.

---

## 14. Content experiments  [DESIGN ONLY — none started]

Deterministic A/B *across separate content opportunities*, never
simultaneous duplicate posts to the same audience. Reserved, inert fields:

- ledger row: `experiment_id`, `experiment_variant`, `experiment_hypothesis`
- creative id already splits `hook_variant` / `cta_variant`

An experiment is "HOOK A on opportunity 1" vs "HOOK B on opportunity 2",
compared on the same normalised KPI. Nothing runs until an experiment is
explicitly defined.

---

## 15. First-live baseline  [IMPLEMENTED]

Nothing has published. `npm run social:metrics -- baseline` shows every
platform metric as **`NOT_AVAILABLE_YET`** — deliberately distinct from
`0`. A real `0` only appears once the provider actually reports `0` for a
live post.

---

## 16. Dashboard / CLI report  [IMPLEMENTED]

`npm run social:metrics -- report` — one line per placement:

```
PLATFORM  CONTENT / GOAL  PUBLISHED  AGE  VIEWS  IMPR  ENG  ENG%  CLICKS  SITE  AFF  STATUS
```

Legend: `—` = not supported on this platform · `·` = no reading yet (NOT
zero) · `n/a` = not published yet. Each row also prints the engagement
basis, the windows with data, any sync error, the live post URL (if the
provider returned one), and the CTA's frozen `utm_*`.

---

## 17. Safety  [IMPLEMENTED]

- Metrics code is read-only. No `createPost` / `updatePost` / `deletePost`
  / schedule / publish / DM / comment / reply anywhere in
  `scripts/socialMetrics.mjs`, `lib/social/distribution/metrics.mjs`,
  `lib/social/distribution/attribution.mjs`, or the `metrics*` commands in
  `scripts/socialPublish.mjs`.
- The null provider (no `BUFFER_ACCESS_TOKEN`) refuses `getPostMetrics` /
  `getAggregatedMetrics` too.
- Attribution refuses any non-site host — it cannot stamp an eBay URL.
- No personal data in any `utm_*` value; `campid` unchanged; existing
  affiliate URLs byte-identical.

---

## 18. Quota waiter  [REPORT ONLY — untouched]

`scripts/_waitForQuota.sh` was **created** (not modified) in commit
`4ce7cce`; that is why it appears in that commit's file list. It is
read-only: it polls `getBrowseRateLimit()` (a free rate-limit read, **no
Browse call**), sleeps 900s, and exits `0` only once `remaining >= 1500`
— safely above the 900 recovery reserve. 13E.7A does not touch it, does
not restart it, and adds nothing that forces a Browse call. The
already-running waiter process from the post-quota phase is left alone.

---

## 19. Future measurement support  [FUTURE]

- Buffer `aggregatedPostMetrics` per-channel roll-ups for the reporting
  windows (adapter method already added: `getAggregatedMetrics`).
- A PostHog Insights export job that writes `attribution-import.json`
  automatically (keyed by `utm_content`).
- Newsletter-signup event in the taxonomy.
- If wanted: a single reserved `social` EPN surface (§8).
