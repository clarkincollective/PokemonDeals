# Vercel cost controls (VERCEL-COST-1)

Emergency cost audit after ~$150 of on-demand overage in one cycle at
~850 human pageviews/day — so the spend is driven by **crons + crawler
traffic + image optimization**, not user load.

Run `npm run infra:vercel-cost` for the current cost-surface (cron
cadence, ISR windows, image config). LIVE billing numbers are on the
Vercel **Usage** dashboard (this repo has no billing API token).

## Top cost drivers (ranked)

| # | Driver | Root cause | Confidence |
|---|---|---|---|
| P0 | **Image Optimization** (transforms + cache writes + reads) | AVIF+WebP dual encode, uncapped `deviceSizes` (8 widths to 3840) + `imageSizes` (8), 3 qualities, and **eBay seller photos** (thousands of unique, ephemeral URLs) each getting a full variant set with near-zero cache reuse | HIGH |
| P0 | **ISR Writes** | `cards/[slug]` @900s × ~720 hubs, `deals/[id]` @120s (highest-traffic page), `pokemon/[slug]` / `sets/[slug]` @900s — crawler hits past the window each trigger a regeneration | HIGH |
| P0 | **Fluid Active CPU / Provisioned Memory** | 28 crons, several every 15-30 min; `POOL_REVALIDATE_SECONDS=45` forced a Supabase query + Next data-cache write ~every 45s; a >2 MB `unstable_cache` object that never caches (re-queries every request) | HIGH |
| P1 | **Observability Events** | ~one event per function invocation; ~400-3000 cron invocations/day + crawler traffic. App `console.*` is NOT the cause (18 total across all API routes). Check whether **Observability Plus** is enabled. | MEDIUM |
| P1 | **Fast Origin Transfer** | large ISR HTML + un-capped image bytes to crawlers | MEDIUM |
| P2 | **Build CPU** | ~one production build per push to `main`; the repo pushes often. `generateStaticParams` returns `[]` everywhere, so it is NOT static-generation explosion. | LOW-MED |

## Changes made in VERCEL-COST-1

### Image (`next.config.mjs` + `components/DealImage.js`)
- `formats: ["image/webp"]` (was `["image/avif","image/webp"]`) — one
  format ≈ half the transforms + cache writes over an image's lifetime,
  and AVIF encode is 2-3× the CPU per transform.
- `deviceSizes: [384, 640, 828, 1080]` (was the 8-wide default to 3840),
  `imageSizes: [128, 256]` (was 8) — nothing on the site renders an image
  wider than ~half viewport; this collapses the `vw`-driven width matrix.
- `qualities: [75, 85]` (was `[75, 85, 90]`); `quality={90}` → `85` on the
  two card-detail heroes — 85 vs 90 is invisible at 128-256 CSS px.
- **eBay listing photos served `unoptimized`** — direct from `i.ebayimg.com`
  (already web-optimized JPEGs, unique per ephemeral listing, ~no Vercel
  cache reuse). Canonical TCGplayer catalogue art stays optimized
  (immutable, ~720 images shared across all hubs forever).
- `minimumCacheTTL` unchanged at 31 days (already optimal).

**Expected impact:** variant-matrix ceiling per source image 8×2×3=48 →
4×1×2=8; eBay images → **0** transforms. Transformations + Cache Writes:
**HIGH reduction** (est. 50-80%). Cache Reads follow down. Confidence HIGH.

### ISR (`export const revalidate`)
| route | before | after |
|---|---|---|
| `/` | 60 | 180 |
| `/best-finds`, `/japanese-cards` | 60 | 300 |
| `/deals`, `/sealed-deals` | 300 | 600 |
| `/deals/[id]`, `/sealed-deals/[id]` | 120 | 600 |
| `/cards/[slug]`, `/pokemon/[slug]`, `/sets/[slug]`, `/cards`, `/pokemon`, `/sets` | 900 | 3600 |
| `/market-data/*` | 900 | 21600 |
| `/sitemaps/[segment]` | 300 | 900 |

All windows stay **fresher than the data's real change rate** (deal scan
every 15 min, verify every 30 min, catalogue sync every 30 min). Deal
pages are never more than 10 min stale. No Googlebot discoverability
change — canonical/noindex/sitemap logic untouched.

**Expected impact:** ISR Writes **HIGH reduction** on the catalogue pages
(4× fewer on `cards/[slug]` etc.), ~2× fewer on deal pages. Confidence HIGH.

### Compute / Supabase (`lib/deals.js`)
- `POOL_REVALIDATE_SECONDS` 45 → 180 — the deal-pool `unstable_cache`
  windows (homepage flagship, best-finds, deals-pool, deals-page,
  auctions). ~4× fewer Supabase pool queries + Next data-cache writes.
  Confidence HIGH. **Supabase pressure: directly relieved.**

### Crons (`vercel.json`)
- `screen-deal-images` `15,45 * * * *` → `15 * * * *` (twice-hourly →
  hourly; image screening, not the deal scanner).
- `refresh-catalog` `*/15` → `*/30` (catalogue sync; 30 min is ample).
- The eBay deal scanner (`refresh-deals` sweeps), `verify-deals`,
  `sweep-stale-deals`, `ingest-feed` are **untouched**.

## Not changed (recommendations only)

- **Deploy frequency** — batch commits; push to `main` less often, or use
  a preview branch and promote. Each push = one production build.
- **`unstable_cache` >2 MB object** — one cached deal-pool payload exceeds
  the 2 MB limit and silently never caches (re-queries Supabase every
  request; see the "Failed to set Next.js data cache" build warning). Trim
  its `select` / row cap under 2 MB so it actually caches. (Left for a
  focused follow-up — needs to identify the exact key without regressing
  a page.)
- **Observability Plus** — verify it's off if unused.
- **Web Analytics custom events** — every `data-analytics-*` event bills;
  prune to the ones you actually report on.

## Spend Management thresholds (recommended — set manually)

Vercel → team **Settings → Billing → Spend Management**:

| threshold | action |
|---|---|
| **$25** | email alert (soft — "something changed") |
| **$50** | email + Slack/webhook alert (investigate now) |
| **$100** | hard pause / notify (Pro supports a spend cap that pauses the project) |

Also set a **monthly budget** at your expected baseline + 25%. Do not
enable a hard pause on a production e-commerce/affiliate site without a
runbook — a pause takes the site offline.

**Billing settings are not changed by code or this phase — set them in
the dashboard.**
