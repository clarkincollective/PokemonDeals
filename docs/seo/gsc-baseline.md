# Search Console baseline and weekly comparison (Phase 17A → 17B+)

Data file: [`gsc-baseline-2026-09-11.json`](./gsc-baseline-2026-09-11.json). Every number there is copied
from the GSC Search Analytics / Sitemaps API exports taken on 2026-09-11. Nothing is estimated, and
anything the API does not expose is recorded as `null`.

## Baseline (2026-08-10 → 2026-09-11, web, dataState=all)

| Metric | Value |
|---|---|
| Submitted URLs (sitemap index) | 26,476 (0 errors, last read 2026-09-08) |
| URLs with ≥1 impression | 327 |
| Impressions | 855 |
| Clicks | 5 (all homepage) |
| Impressions 2026-08-15 → 08-28 | 13 |
| Impressions 2026-08-29 → 09-11 | 842 |
| Keyed queries / their impressions | 192 / 239 |

| Family | URLs seen | Impressions | Avg position (impr.-weighted) | URLs top-10 for ≥1 query |
|---|---|---|---|---|
| Card `/cards/*` | 213 | 404 | 22.7 | 103 |
| Deal `/deals/<id>` | 65 | 180 | 18.6 | 49 |
| Guide `/guides*` | 5 | 96 | 59.3 | 1 |
| Home `/` (incl. query variants) | 21 | 67 | 6.8 | 18 |
| Set `/sets/*` | 9 | 33 | 62.1 | 2 |
| Species `/pokemon/*` | 5 | 32 | 64.9 | 0 |
| Search `/search` | 1 | 6 | 16.7 | 0 |

Striking distance (page + query at position 4–15): 16 pairs, all listed in the JSON. The largest are
"arcanine shadowless" (13.0), "lickitung aquapolis" (9.5) and "glaceon 171 promo" (10.0). The deal URLs
among them now 308 to their card pages.

Google was still in first-crawl ramp-up at baseline: 842 of the 855 impressions came in the last 14 days.
Read every average position here as a starting point, not a verdict.

## What Phase 17B changed (the thing being measured)

- Card sitemap split into four value-band shards, with truthful `<lastmod>`: the latest material (≥2% and ≥$0.05) change between two of our own daily price observations.
- A server-rendered "How much is <card> worth?" answer and printing details on every `/cards/*` page.
- A bounded explore / next-step module on card pages (species, set, price-band and era categories, price alert, eBay search).
- A server-rendered price-checker guide on `/search`, and a "Check a card's price" secondary hero action.
- Social footer and `Organization.sameAs` (Instagram, X).

## Weekly comparison (every Monday, same 28-day rolling window and a fixed 7-day window)

Pull with `node scripts/_gscAudit.mjs perf ...`, writing output **outside the repo** (`_gsc*` files are not
gitignored). Compare against this baseline and the previous week.

| # | Metric | Why it tells us whether 17B worked |
|---|---|---|
| 1 | Card-family impressions, clicks, CTR | The worth answer targets value intent on pages Google already shows |
| 2 | Card URLs with ≥1 impression (213 at baseline) | Coverage: are more card pages entering results? |
| 3 | Card URLs with position ≤10 for ≥1 query (103) | Ranking depth |
| 4 | Impr.-weighted avg position, card family (22.7) | Direction of the whole family |
| 5 | Queries matching `worth\|value\|price\|how much` → card URLs: impressions and avg position | Direct test of the worth block |
| 6 | Variant queries (`shadowless`, `promo`, `full art`, `secret`, `holo`…) → card URLs | Printing-identity exposure |
| 7 | `/search` impressions, position (16.7), CTR | Price-checker front door |
| 8 | Queries containing `price checker\|value lookup\|worth` → `/search` | The tool intent |
| 9 | The 16 baseline striking-distance pairs: position and clicks, now on the 308-target card URL | Did near-misses convert? |
| 10 | Sitemap: submitted vs indexed per card shard (GSC Sitemaps UI) | Shard + lastmod effect on crawl/index |
| 11 | Clicks, total and non-homepage | The only outcome that pays |
| 12 | Brand queries (`pokemon deal finder`, `pokemondealfinder`, `pkmdealfinder`) | Social identity / sameAs effect |

**Decision rule.** Look only at trends across at least 3 consecutive weekly readings, and only for a family
with ≥100 impressions in the window. One week of movement at this volume is noise.

**Do not** compare a 28-day window that straddles a deploy against one that doesn't without saying so. The
17B deploy date belongs in the weekly log.
