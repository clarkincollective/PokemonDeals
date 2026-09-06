# P0.4 — Deal variety / discovery coverage / homepage surfacing audit

**Diagnostic only. No production behaviour was changed.** All numbers are read
straight from production (`deals`, `watchlist`, `card_catalog`, `discovery_events`)
on 2026-09-06 via `scripts/_dealVarietyAudit.mjs` (read-only, service-role).
`discovery_events` only spans ~7 days (first row 2026-08-30), so no 30-day
event window is available; deal `first_seen_at` windows are used where a
longer view is needed.

---

## TL;DR

The database genuinely **has** variety — 895 active deals across **257 species /
623 exact printings / 188 sets**, top-10 species only ~30% of the pool, top-10
exact printings only 7.7%. It does **not** feel that way because:

1. The surfaced pool is **small and shallow**: ~895 deals, **p90 age 5.2 days**,
   ~96% of it discovered in the last 7 days. Expired long-tail deals are never
   re-found, so the effective library is capped at *"roughly one week of
   sweeping"*, and one week of sweeping over-samples popular cards (they have
   far more eBay listings).
2. **Scan capacity is concentrated.** A 26-card "priority" tier is re-scanned
   4×/day across 6 marketplaces (1,363 deal events / 7d on **17 distinct
   printings**); US sweep runs every 15 min vs every 2 h for the other five
   countries (US = 62% of deals). The 8,383-card "extended" tier gets one
   dedicated re-scan **per ~30 days per country**.
3. The **curated homepage lanes don't rotate.** "Best deals right now" (4),
   "Just added" (3) and "Auctions ending soon" (3) are deterministic; a
   returning visitor sees the same ~10 hero cards for a day+. The shuffled grid
   *does* rotate but only over the **newest 400 distinct cards** (oldest 2.5
   days) — it never shows the other ~50% of active inventory.

The homepage **ranker itself is not the problem** (see §6/§10 — at n = 4–12 it
already returns 4/4 and 10–12/12 distinct species; diversity models barely beat
it). Fixing perceived variety does **not** require weakening any quality gate.

---

## 1. Active inventory diversity

**Total active deals: 895** (881 scan-discovered, 14 external-feed).

| Dimension | Distinct | Notes |
|---|---|---|
| Pokémon species | **257** | of 1,025 in the English catalogue (25.1%) |
| Exact printings (`card_tcgplayer_id`) | **623** | 455 of them have exactly **1** active deal |
| Sets | **188** | of 217 in the catalogue (86.6%) |
| Eras (coarse) | WOTC 180 · everything-else 715 | catalogue is ~90% post-WOTC |
| Grades | 11 grade buckets | PSA 9 (18), PSA 10 (12), PSA 8 (10)… |

| Split | Count | % |
|---|---|---|
| Raw | 837 | 93.5% |
| Graded | 58 | 6.5% |
| Buy It Now (`FIXED_PRICE`) | 610 | 68% |
| Auction | 285 | 32% |
| English | 799 | 89% |
| Japanese | 96 | 11% |

**Marketplace / country**

| Marketplace | Deals | Item location |
|---|---|---|
| EBAY_US | 556 (62%) | US 647 · GB 147 · JP 33 · DE 27 · CA 19 · AU 15 |
| EBAY_GB | 95 | |
| EBAY_CA | 97 | |
| EBAY_AU | 58 | |
| EBAY_DE | 53 | |
| EBAY_IT | 36 | |

**Price bands**

| Band | Paid price | Market reference |
|---|---|---|
| `<$25` | **417 (47%)** | 209 |
| `$25–50` | 211 | 276 |
| `$50–100` | 119 | 190 |
| `$100–250` | 74 | 111 |
| `$250+` | 74 | 109 |

**Concentration**

| Metric | Value |
|---|---|
| Deals per species (mean) | 3.48 |
| Deals per exact printing (mean) | **1.44** |
| Deals per set (mean) | 4.76 |
| Top-5 species share | **21.2%** |
| Top-10 species share | **29.5%** |
| Top-20 species share | 41.0% |
| Top-10 **exact-printing** share | **7.7%** |

**Top 10 species:** Pikachu 69 · Charizard 55 · Gengar 27 · Blastoise 20 ·
Dragonite 19 · Espeon 17 · Rayquaza 16 · Mew 14 · Gyarados 14 · Mewtwo 13.
(Top 20 adds Eevee 13, Deoxys 13, Umbreon 11, Houndoom 11, Reshiram 10,
Mimikyu 10, Lugia 9, Psyduck 9, Ninetales 9, Sylveon 8.)

**Top 10 exact printings:** Deoxys VMAX (Crown Zenith GG) 9 · Pikachu (Base Set)
9 · Charizard (Expansion Pack) 7 · Pikachu & Zekrom GX (SM Promos) 7 · Pikachu V
(Lost Origin TG) 7 · Dark Houndoom (Neo Destiny) 6 · Dark Gyarados (Team Rocket)
6 · Zamazenta V (Astral Radiance TG) 6 · Dragonite VSTAR (SWSH Promo) 6 ·
Espeon V (SWSH Promo) 6.

**Top 20 sets:** XY Promos 36 · SV: Black Bolt 35 · SM Promos 31 · Base Set 26 ·
SV: White Flare 24 · ME: Ascended Heroes 20 · SWSH Promo 20 · Team Rocket 19 ·
SV: 151 18 · Fossil 17 · Jungle 17 · Crown Zenith GG 17 · Neo Destiny 15 ·
Prismatic Evolutions 15 · Paldea Evolved 15 · Skyridge 14 · Aquapolis 13 ·
Expansion Pack 12 · Cosmic Eclipse 12 · Shrouded Fable 12.

**Read:** the *database* is not concentrated on a handful of cards — top-10
printings are under 8% and 73% of printings are singletons. The concentration
that exists is at the **species** level (Pikachu + Charizard ≈ 14% of every
deal), and that mirrors real eBay listing supply, not a bug.

---

## 2. Long-tail coverage vs the catalogue

| Layer | Printings | Species | Sets |
|---|---|---|---|
| `card_catalog` (English) | **29,342** | **1,025** | 217 |
| Active `watchlist` (scan targets) | 8,409 rows (4,943 EN / 3,466 JP) | — | — |
| Active deals | 623 | 257 | 188 |

| Coverage of… | by active deals |
|---|---|
| catalogue **species** | **25.1%** (768 species have 0 active deal) |
| catalogue **sets** | 86.6% (29 sets have 0) |
| catalogue **printings** | **2.1%** |
| **active watchlist printings** | **7.4%** |

**New-deal discovery windows** (`deals.first_seen_at`):

| Window | New active deals | Distinct species | Distinct printings | Distinct sets |
|---|---|---|---|---|
| 24 h | 271 | 127 | 226 | 115 |
| 7 d | 857 | 256 | 612 | 185 |
| 30 d | **895 (= entire pool)** | 257 | 623 | 188 |

→ **The entire active pool is < ~11 days old.** There is no accumulated
long-tail: whatever expired last month is simply gone.

**Segment coverage (active deals ÷ catalogue rows in that segment):**

| Rarity segment | Catalogue | Active deals | Coverage |
|---|---|---|---|
| Illustration rare | 728 | **180** | 24.7% (strong) |
| Holo rare | 2,151 | 169 | 7.9% |
| Ultra (EX/GX/V/VMAX/VSTAR) | 2,566 | 166 | 6.5% |
| Promo | 3,963 | 113 | 2.9% |
| Secret/rainbow | 719 | 36 | 5.0% |
| Rare | 4,041 | 49 | 1.2% |
| Common | 7,059 | 52 | 0.7% |
| Uncommon | 6,658 | 17 | 0.3% |

| Era | Catalogue | Active deals |
|---|---|---|
| WOTC (1999–2003) | 2,784 | 180 (6.5%) |
| Everything post-WOTC | 26,558 | 715 (2.7%) |

| Language | Catalogue | Watchlist | Active deals |
|---|---|---|---|
| English | 29,342 | 4,943 | 799 |
| Japanese | **0 in `card_catalog`** | 3,466 | **96** |

**Almost-never-producing segments:** commons/uncommons (expected — low value,
few genuinely below-market), modern bulk rares, and **Japanese** (well-watched
— 3,466 rows — but only 96 deals and completely absent from `card_catalog`, so
JP browse pages have nothing to hang deals on). Illustration rares and vintage
WOTC are, contrary to intuition, the **best**-covered segments.

---

## 3. Discovery events (7-day log)

`discovery_events` records one row every time a lane evaluated a listing far
enough to know the card. **The scanner only logs `became_deal = true` events**
(sweep/priority) — it does not log scan-side rejections — so a scan acceptance
rate is not computable here. The external feed logs every verification.

| Lane | Events 7 d | Distinct listings | Distinct printings | Became deal | Re-eval mean |
|---|---|---|---|---|---|
| **sweep** | 2,335 | 2,067 | **1,204** | 2,335 (logged-on-success only) | 1.13 |
| **priority** | 1,363 | 738 | **17** | 1,363 | 1.85 |
| **external** | 4,462 | 2,941 | 597 | **49 (1.1%)** | 1.52 |

24 h: 1,072 events · 353 distinct printings evaluated · 243 distinct printings
became a deal · search coverage **3.5%** of the active watchlist.
7 d: 8,160 events · 1,651 distinct printings evaluated · 1,249 became a deal ·
search coverage **16.5%** of the active watchlist.

**Where diversity is lost:**

- **priority lane**: 1,363 "deal discovered" events in a week across **17
  distinct printings** — it does zero breadth work and permanently re-freshens
  the same ~20 famous cards.
- **external lane**: 4,462 verifications → 49 deals. Rejection shape:
  `trust / graded / no catalogue match` 3,335 · `no price` 905 · `not a deal`
  173. Low signal, real Browse spend.
- **sweep lane** is the only broad engine: 1,204 distinct printings / week.
  Everything the site's variety currently rests on comes from here.

---

## 4. Query / search coverage

Cron allocation (`vercel.json`, 49 crons):

| Lane | Cadence | Targets |
|---|---|---|
| sweep `EBAY_US` | **every 15 min** (96/day), 5 pages | whole eBay Pokémon category, matched to every active watchlist card |
| sweep `EBAY_GB/IT/AU/CA/DE` | every 2 h (12/day each), 8 pages | same |
| `tier=priority` | every 6 h (4/day), all marketplaces | **26 cards** |
| `tier=extended` | **one country-chunk per day** (5 chunks × 6 countries = 30 monthly slots) | ~8,383 cards |

| Coverage measure | 24 h | 7 d |
|---|---|---|
| Distinct active-watchlist printings seen in `discovery_events` | 3.5% | **16.5%** |
| SWEEP distinct printings by marketplace (7 d) | — | US 877 · GB 234 · CA 215 · AU 162 · DE 104 · IT 96 |
| SCAN events by marketplace (7 d) | — | US 1,911 (46%) · CA 773 · GB 483 · AU 260 · IT 139 · DE 132 |

**Findings**

- **Eligible targets:** 8,409 active watchlist rows. Only ~16.5% appear in the
  log in a week; the rest are only reachable via the extended tier's **~30-day
  per-country rotation**, i.e. a given extended card is deliberately re-scanned
  about once a month.
- **Popular Pokémon do dominate**, but structurally: the 26-card priority tier
  is scanned 4×/day everywhere, and US sweep runs 8× more often than any other
  country's, so US + famous cards get vastly more attention.
- **Long-tail cards can wait weeks** for a dedicated scan; between scans a deal
  on them, once expired, is only re-found if sweep happens to catch a *new*
  listing for that exact card in its 5–8 fresh-listing pages.
- The same US sweep runs re-catch the same US listings repeatedly (sweep
  per-listing re-eval max 25).

---

## 5. API / quota allocation — and P0.3.2 follow-up

| Consumer | 7-day Browse / verify spend | Yield |
|---|---|---|
| priority tier | 1,363 deal events on 17 printings | keeps ~20 cards permanently "fresh" |
| external feed | 4,462 verifications | 49 deals (**1.1%**) |
| external feed, wasted | **972 distinct rejected listings re-verified ≥ 2×**, none ever became a deal | ~1,000 Browse calls |
| sweep | 2,335 accepted events, 1,204 distinct printings | the diversity engine |

**Marketplace balance:** external discovery board is **GB (2,619) + US (1,828)
= 99.7%** of external events; AU/CA/DE/IT get essentially none. Combined with US
sweep at 8× cadence, non-US/GB long-tail is materially under-served relative to
the "six equal marketplaces" intent.

**Is the recent-verification skip working?** Partly. `RECENT_VERIFY_HOURS = 20`.
Overall external re-eval mean is **1.52×** (down from the 3–5× churn P0.3.2
targeted), so within-20 h re-verification is being suppressed. **But** 972
distinct listings that already failed once were re-verified again because they
sat on the discovery board longer than 20 h — the skip window is shorter than
board dwell time.

### P0.3.2 production verdict: **HEALTHY (with one WATCH)**

- HEALTHY: the re-verification-churn fix is holding — 1.52× vs the prior 3–5×;
  no runaway per-listing verification.
- WATCH: (a) `RECENT_VERIFY_HOURS = 20` is shorter than how long a rejected
  board listing lingers → ~1,000 avoidable Browse calls/week; (b) the external
  lane's structural yield is only 1.1% (49/4,462) — efficient per-call, but a
  low-value use of the shared budget compared with sweep.

---

## 6. Homepage vs database

Homepage lanes on the default page-1 view (`app/page.js`, `showPromo`):

| Lane | Source | Size | Ranking |
|---|---|---|---|
| "Best deals right now" | `fetchHomepageFlagshipDeals` | **4** | flagship composite (discount × $ saved × ref-confidence), 1 tile per canonical card. **Deterministic.** |
| "Just added" | `fetchFreshFinds` | **3** | `first_seen ≤ 48 h`, premium gate, newest-first, dedup by card. **Deterministic.** |
| "Auctions ending soon" | `fetchAuctionsEndingSoon` | **3** | end-time tiers. **Deterministic.** |
| Grid preview | `fetchDealsPool` → dedup by card → `shuffled(newest 400).slice(0, 9)` | **9** | random. **Rotates.** |

**Flagship candidate pool: 157 of 895 deals** (English + Buy It Now +
`market_price ≥ $75` + `discount ≤ 65%`). 56 species, 110 printings, one
species repeated up to 17×, mean discount 29.8%, mean saving $102.

| Homepage view (simulated on live pool) | n | Distinct species | Distinct printings | Distinct sets | Max repeat / species | Mean discount | Mean $ saved |
|---|---|---|---|---|---|---|---|
| Flagship top-4 (CURRENT) | 4 | **4** | 4 | 4 | 1 | 57.9% | $615 |
| Best-finds top-12 (CURRENT) | 12 | **10** | 12 | 12 | 2 | 53.5% | $392 |
| Grid preview pool (newest 400) | 400 | 207 | 400 | 123 | 23 | 35.2% | $37 |
| Random 9-card grid draw (mean of 200) | 9 | **8.6 / 9** | — | — | — | — | — |

**Findings**

- Per-visit, the homepage is **more diverse than it feels**: flagship 4/4
  distinct species, best-finds 10/12, a random grid draw 8.6/9.
- The repetition is **across visits, not within a page**: flagship + "Just
  added" + auctions are deterministic and change slowly (45 s revalidate, but
  the underlying top-N is stable for hours to days), so a daily visitor sees
  the same ~10 hero cards.
- The grid **does** rotate, but only over the **newest 400 distinct cards
  (oldest ≈ 2.5 days)** — it structurally excludes ~50% of the active pool
  (deals 3–11 days old). Anything older than the newest 400 never appears on
  the homepage at all.
- Premium lanes draw from the **157-deal high-value slice**, so the ~420
  `<$25` deals (47% of inventory) never get a curated homepage placement —
  they exist only in the shuffled grid and `/deals`.
- Only **198 of 895** deals are `exact_verified` within 12 h at any moment, so
  the premium lanes are additionally thinned to whatever the priority tier +
  the last sweep just re-verified.

---

## 7. Rotation / fallback

- **Mechanism:** `fetchDealsPool` returns the newest ≤ 2,000 active English
  deals; `app/page.js` dedups by watchlist card, takes the first **400**,
  Fisher–Yates **shuffles**, takes **9**.
- **When it activates:** always, on the default unfiltered page-1 view. It is a
  permanent rotation, not a rate-limit fallback. (The 2,000-row pool width was
  itself a fix for a real rate-limit-induced "frozen window" — that part
  works.)
- **Pool size:** newest 400 distinct cards. **Repeat window:** none — every
  reload re-shuffles, so a card can appear on consecutive reloads.
- **Does it improve perceived variety?** Within the grid, yes (8.6/9 distinct
  species per draw). **Can it make things look *less* diverse?** Yes, two ways:
  (1) it is capped at the newest 400, so it silently hides ~half the live
  inventory; (2) the shuffle is *uniform over that pool*, so species that have
  many active listings (Pikachu, Charizard) appear in most draws in rough
  proportion to their ~1-in-7 share — a curated diversity pass would show them
  less often than a fair shuffle does.

---

## 8. Quality vs diversity trade-off

The scanner does **not** persist rejected candidates, so exact rejection-reason
counts are not available. What is measurable:

| Signal | Count |
|---|---|
| Deals created then **disqualified** (`disqualified_reason`, historic) | `condition:heavily_played` 492 · `condition:damaged` 363 · `auction_ended` 138 · `authenticity:proxy_or_counterfeit` 7 |
| External-feed rejections (7 d) | `trust / graded / no catalogue match` 3,335 · `no price` 905 · `not a deal` 173 |
| Scanner gates (code, `lib/dealMatching` + `lib/dealQuality`) | trading-card check, proxy/counterfeit text, seller trust (≥95% / ≥10 feedback), exact-printing match (name + collector number + language), per-listing condition pricing (NM assumption only when supported), reference-sanity (≥5 matched listings all ≤55% of reference ⇒ suppress), suspicious-raw-discount getItem check |

**Read:** the gates are doing real work — ~1,000 already-published deals were
later pulled for damage/condition alone, and the reference-sanity gate exists
precisely to stop advertising a fiction. **Deal *count* is not threshold-bound**
(895 real deals, `DISCOUNT_THRESHOLD` already at 10%). The variety ceiling is
**pool depth and acquisition shape**, not gate strictness. Lowering the discount
threshold or relaxing condition/reference gates would add weak/fake deals for a
small diversity gain — not recommended, and not necessary (see §10).

---

## 9. Homepage vs dedicated browse — current state

A browse destination already exists, but fragmented and capped:

| Route | Backing | Cap |
|---|---|---|
| `/deals` (`fetchDealsPage`) | newest / discount / price / ending sorts + filters | **600 deals** (25 pages × 24) |
| `/best-finds` | flagship composite, longer list | flagship pool |
| `/deals/under-25`, `/deals/graded` | filtered `/deals` | 600 |
| `/japanese-cards` | `language=japanese` pool | 96 deals |
| `/pokemon`, `/sets` | species / set hubs over `card_catalog` | catalogue-scoped |

With only 895 active deals, the 600-row `/deals` cap covers ~67% of inventory —
adequate today, tight if the pool grows. The real gap vs the intended
"homepage = curated quality + variety / browse = depth + choice" model is that
**the homepage's own preview is 9 shuffled cards** with a single "Browse all
deals" link, and the depth is spread across `/deals`, `/best-finds`,
`/deals/<category>` and the hubs rather than one obvious "Browse all deals"
surface with the full facet set (newest / discount / price / species / set /
raw-graded / grade / marketplace / auction-BIN / price chips).

**No consolidation is needed yet** — the routes work. The recommendation (§13)
is to make one of them the canonical "Browse all deals" entry and widen its
cap as the pool grows, not to rebuild.

---

## 10. Offline diversity simulations (live pool, n = 12)

Run against the flagship-ranked pool. **Higher `distinct species` with equal or
near-equal `mean $ saved` ⇒ variety can improve without weakening deals.**

| Model | Distinct species | Distinct printings | Distinct sets | Distinct price bands | Mean discount | Mean $ saved | Strong deals suppressed? |
|---|---|---|---|---|---|---|---|
| **CURRENT** (1 tile / card) | 10 | 12 | 12 | 4 | 53.5% | **$392** | baseline |
| A — max 1 printing / lane | 10 | 12 | 12 | 4 | 53.5% | $392 | identical to current |
| B — max 2 deals / species | 9 | 10 | 10 | 3 | 51.9% | $455 | no |
| C — quality + soft species cap (≤3) | 10 | 12 | 12 | 4 | 53.5% | $392 | no |
| **D — quality + freshness + species (≤2) + set (≤3) + price-band round-robin** | **11** | 12 | 12 | 4 | 56.0% | $274 | mild — swaps a few $600 vintage tiles for $150–300 mid-value ones |

**Read:** at n = 4–12 the current ranker is *already* near-optimal for
diversity (10/12 species). Model D buys +1 species and much better price-band
spread for a ~30% lower mean saving (because it deliberately promotes mid-value
cards into the lane). **The models barely move because the constraint is the
157-deal pool, not the ranking function.** The large win is upstream: widen the
pool (deeper inventory, a curated `<$25` lane) and **rotate** the curated set on
each revalidate.

---

## 11. Variety metrics (baseline, 2026-09-06)

| Metric | Value |
|---|---|
| `ACTIVE_DEALS` | 895 |
| `ACTIVE_SPECIES_COUNT` | 257 |
| `ACTIVE_PRINTING_COUNT` | 623 |
| `ACTIVE_SET_COUNT` | 188 |
| `TOP_5_SPECIES_SHARE` | 21.2% |
| `TOP_10_SPECIES_SHARE` | 29.5% |
| `TOP_10_PRINTING_SHARE` | 7.7% |
| `SINGLETON_PRINTINGS` | 455 / 623 (73%) |
| `DEAL_AGE_P50 / P90 / MAX (days)` | 1.8 / 5.2 / 10.7 |
| `EXACT_VERIFIED_≤12H` | 198 / 895 (22%) |
| `HOMEPAGE_FLAGSHIP_SPECIES_DIVERSITY` | 4 / 4 |
| `HOMEPAGE_BESTFINDS12_SPECIES_DIVERSITY` | 10 / 12 |
| `HOMEPAGE_GRID9_SPECIES_DIVERSITY (mean)` | 8.6 / 9 |
| `FLAGSHIP_CANDIDATE_POOL` | 157 / 895 |
| `DISCOVERY_24H_DISTINCT_SPECIES` | 127 |
| `DISCOVERY_24H_DISTINCT_PRINTINGS` | 226 |
| `DISCOVERY_7D_DISTINCT_PRINTINGS (log)` | 1,651 evaluated / 1,249 became deal |
| `SEARCH_COVERAGE_24H` | 3.5% of active watchlist |
| `SEARCH_COVERAGE_7D` | 16.5% of active watchlist |
| `CATALOGUE_SPECIES_COVERAGE` | 25.1% (768 species with 0 deals) |
| `CATALOGUE_PRINTING_COVERAGE` | 2.1% |
| `WATCHLIST_PRINTING_COVERAGE` | 7.4% |
| `PRIORITY_TIER_SIZE` | 26 cards / 17 currently producing |
| `EXTERNAL_FEED_YIELD_7D` | 49 deals / 4,462 verifications (1.1%) |
| `EXTERNAL_FEED_REVERIFY_MEAN` | 1.52× (972 rejected listings re-verified ≥2×) |
| `MARKETPLACE_SHARE_US` | 62% of deals; 46% of scan events |

---

## 12. Root-cause ranking

| Cause | Verdict | Evidence |
|---|---|---|
| **Scan / query allocation shape** | **P0** | 26-card priority tier re-scanned 4×/day × 6 markets = 1,363 events / 7 d on 17 printings; extended tier (8,383 cards) re-scanned ≈ 1×/30 d/country; US sweep 8× the cadence of the other 5. Capacity is spent on popular cards, not breadth. |
| **Inventory depth / no accumulation** | **P0** | Deal age p90 5.2 d; 895 = entire 30-day discovery total; expired long-tail deals are never re-found ⇒ effective library ≈ "one week of sweeping". |
| **Homepage surfacing (rotation, not ranker)** | **P1** | Flagship / "Just added" / auctions are deterministic → same ~10 hero cards across visits. Grid rotates only over newest-400 (≈ 50% of pool hidden). No curated `<$25` lane despite 47% of deals being `<$25`. |
| **Discovery coverage** | **P1** | Search coverage 16.5% / 7 d of the active watchlist. Japanese: 3,466 watchlist rows → 96 deals, and 0 rows in `card_catalog`. |
| **Deal qualification for premium lanes** | **P1** | Flagship pool 157 / 895 (BIN + ≥ $75 + ≤ 65%); only 22% verified ≤ 12 h. *Deal count is fine — do not lower thresholds.* |
| **API quota / external-feed efficiency (P0.3.2)** | **P2 / WATCH** | Re-verify churn fixed (1.52× vs prior 3–5×), but 972 rejected listings re-verified ≥ 2× (20 h skip < board dwell); 1.1% structural yield. |
| **Marketplace allocation** | **P2** | External board 99.7% GB+US; AU/CA/DE/IT rely on twice-daily sweep + monthly extended. |
| **Matching / reference availability** | **P2** | 25% species coverage; can't isolate scan-side rejection rate (not persisted). Illustration-rare / vintage coverage is actually *good* (25% / 6.5%). |
| **Deal threshold** | **NOT A PROBLEM** | Already 10%; 895 real deals; §10 shows diversity is achievable without touching it. |
| **Homepage ranker fairness (n = 4–12)** | **NOT A PROBLEM** | Already 4/4 and 10–12/12 distinct species; diversity models A–D don't beat it materially. |
| **Rate-limit "frozen pool"** | **NOT A PROBLEM** | The 2,000-row pool width fix works; per-draw grid diversity is 8.6/9. |

**Primary answer to the brief's A–F question: F (combination), dominated by
D (allocation) + inventory depth, then C (homepage rotation).** It is **not**
primarily E (matching) and **not** the homepage ranker.

---

## 13. Recommendation (design only — do NOT implement in this phase)

### A. Discovery / scanner

- **Repurpose the 26-card priority tier.** It currently buys near-zero variety.
  Options: cut its cadence to every 12–24 h, and/or replace it with a rotating
  "priority-by-signal" set (e.g. the ~200 watchlist cards with the highest
  observed deal-yield or the freshest expiries) so the frequent lane still does
  breadth.
- **Give the extended tier a faster partial rotation.** One country-chunk/day
  ⇒ ~30-day cycle. A second daily extended slice (or smaller chunks scanned
  more often) would cut the long-tail re-scan interval to ~1–2 weeks without
  raising the daily Browse spike much (sweep already covers fast discovery).
- **Add a "recently-expired good deal → re-check" pass.** When a deal with a
  strong discount goes inactive, queue its exact card for a targeted re-scan
  over the next few days. This is the single biggest lever for *pool depth*:
  it lets the long tail persist instead of vanishing after one listing sells.
- **Rebalance marketplaces.** Bring AU/CA/DE/IT sweep cadence closer to
  parity with GB, and/or point the external board at more than GB+US.
- **Sync a Japanese `card_catalog`** so the 3,466 JP watchlist rows have browse
  pages to attach deals to.

### B. Homepage surfacing

- **Rotate the curated lanes.** On each revalidate, draw flagship / "Just
  added" from a *wider* quality-filtered pool (e.g. top ~60 by score) and
  rotate which slice is shown, so a daily visitor doesn't see an identical set.
- **Per-lane species cap (≤ 2)** on flagship / best-finds (Model C — free,
  no quality cost).
- **Add a curated "Under $25 finds" lane** so the 47% of inventory the premium
  lanes structurally exclude gets a home.
- **Widen the grid rotation pool** from "newest 400" to the full active pool
  (or newest ~1,500), so 3–10-day-old real deals aren't hidden.
- Do **not** add a visible deal score; the visible evidence stays
  price + struck reference + "Save $X — N% below market".

### C. Dedicated browse experience

- Promote one route ( `/deals` ) to the canonical **"Browse all deals"** with
  the full facet set already partly present (newest / discount / price / raw–
  graded / grade / marketplace / auction–BIN / price chips) + species + set.
- Raise `MAX_LIST_PAGES` as the pool grows past ~1,500.
- Keep `/best-finds`, `/deals/under-25`, `/deals/graded`, `/japanese-cards`,
  `/pokemon`, `/sets` as they are — they're fine as scoped entries.

### D. API efficiency

- Shorten `RECENT_VERIFY_HOURS` blind spot: track a per-listing "already
  rejected" marker (not just "recently verified") so a bad board listing that
  lingers > 20 h isn't re-verified from scratch.
- Reassess the external feed's budget share vs sweep given the 1.1% yield —
  consider capping external verifications/cycle lower and moving that Browse
  budget to a second extended-tier slice.

### E. Data quality

- Persist scan-side candidate rejections (counts by reason, sampled) so a
  future audit can actually separate "matching rejects it" from "no listing
  exists". Today this is a blind spot.
- Japanese `card_catalog` sync (also listed under A).

### Explicitly do NOT change

- The discount threshold (10%), the reference-sanity gate, condition pricing,
  language / collector-number matching, the seller-trust floor, the
  proxy/counterfeit filter — none of these is causing the variety problem.
- The flagship composite ranking function itself (it's near-optimal at n = 4–12).
- The 2,000-row pool width and the shuffle mechanism (keep; just widen the
  400-card slice it draws from).
- API allocation *totals* — this is a re-shaping exercise, not a "scan more"
  exercise.

---

## 14. Bottom line

- **Total active deals:** 895
- **Distinct species / printings / sets:** 257 / 623 / 188
- **Top-10 species concentration:** 29.5% (top-10 exact printings: 7.7%)
- **Last-24h distinct discoveries:** 127 species / 226 printings (271 new deals)
- **Scanner breadth a problem?** Partly (P1) — sweep is broad, but coverage is
  16.5%/7 d of the watchlist and the long tail isn't maintained.
- **Homepage surfacing a problem?** Yes (P1) — not the ranker; the curated
  lanes don't rotate and the grid hides ~half the pool.
- **Quota allocation a problem?** Yes (P0 for the priority-tier shape; P2 for
  external-feed efficiency).
- **Fallback rotation working?** Yes for per-draw variety (8.6/9 species); but
  it is capped at the newest 400 and can under-represent nothing yet
  *over*-represents popular species vs a curated pass.
- **P0.3.2 verdict:** HEALTHY (re-verify churn fixed at 1.52×) with a WATCH
  (20 h skip window < board dwell → ~1,000 avoidable Browse calls/week; 1.1%
  lane yield).
- **Biggest root cause:** the surfaced inventory is a small (~900),
  fast-churning (~1 week, p90 age 5.2 d), popularity-skewed slice of a
  genuinely varied but *shallow* database — and the curated homepage lanes on
  top of it are deterministic.
- **Best fix:** (1) rotate the curated homepage lanes + add species caps + a
  `<$25` lane + widen the grid pool; (2) re-shape scan allocation — shrink/
  repurpose the priority tier, faster extended-tier rotation, and a
  recently-expired re-check pass to grow pool depth. No quality gate is touched.
- **Can variety improve without reducing deal quality?** **Yes, clearly.** The
  offline models hold n = 12 species diversity at 10–11/12 with mean saving
  within ~15–30% of current, and every recommended lever (rotation, allocation
  re-shape, expiry re-check, pool width) is orthogonal to the discount /
  matching / reference gates.

---

# P0.4.1 — Homepage variety + surfacing fix (implemented)

Scope: **homepage surfacing only.** No scanner allocation, no thresholds, no
reference-confidence / language / multi-card / grade guards, no pricing /
availability / affiliate / SEO-architecture changes. Operates on
already-stored, already-qualified deals. **Zero eBay Browse calls from
homepage rendering.**

## What changed

| Area | Before | After |
|---|---|---|
| Curated lanes (flagship / Just Added / auctions) | deterministic, indefinitely stable | same eligibility + ranking, then a **diversity selector** + a **deterministic 3-hour rotation** |
| "All deals" preview grid | `Math.random()` shuffle of the **newest 400** distinct cards, every render | deterministic per-bucket permutation of the **whole active pool** (recency-tiered so it still leans fresh) then the diversity selector |
| Species repetition | none enforced | **at most 2 per species per lane**, one occurrence preferred before a second; **at most 1 exact printing per lane**; cross-lane exact-printing dedupe |
| Under $25 (~47% of inventory) | no curated placement | new compact 3-card **"Pokemon card deals under $25"** lane linking to the existing `/deals/under-25` |
| Browse depth | small "Browse all deals" pill to `/?page=2` | prominent **"Browse all live deals · N"** button to the canonical `/deals` route (a "keep scrolling" pill is retained) |

### The central selector — `lib/homepageVariety.js`

Pure, deterministic, synthetic-fixture-tested. Takes an **already
eligibility-filtered, already quality-ordered** list and applies, in strict
priority order: (1) the caller's quality/relevance order, (2) no duplicate
exact printing, (3) species diversity, (4) set diversity, (5) price-band
diversity, (6) freshness (tie-break). Every constraint **relaxes gracefully**
through a 7-level ladder — a lane with enough eligible deals always fills; a
lane is never suppressed to obey a cap, and never padded with a repeat.

It does **not** re-rank on quality and does **not** randomise.

### Rotation

- **Interval: 3 hours** (`ROTATION_INTERVAL_HOURS`). Chosen against the
  existing cadence — US sweep 15 min, other countries ~2 h, priority re-scan
  6 h, homepage ISR `revalidate` 60 s. Long enough that every render inside a
  bucket is byte-identical (cache-safe, no hydration drift, no SEO churn),
  short enough that a daily visitor gets 8 distinct windows.
- **Mechanism:** `bucket = floor(now / 3h)`. `fnv1a(bucket + ":" + laneId)`
  derives a stable entry offset into the eligible pool (span 6-8, so rotation
  only ever varies *which strong deals lead*, never trades a top deal for a
  weak one). Flagship + auctions **anchor tile 1** to their single best deal
  and rotate tiles 2-4. The grid uses a full stable-per-bucket permutation.
- Cache: `fetchHomepageLanes` reads the candidate pools (`unstable_cache`,
  45 s); `buildHomepageLanes(pools, { bucket })` is a pure JS transform in the
  page, so `same bucket -> identical output`, `later bucket -> rotated output`.

### Eligibility is untouched

- Flagship pool = the existing shared `selectFlagshipDeals` (same
  `premiumDisplayable` gate, same `lib/flagshipRanking` composite), limit 60.
- Just Added pool = the existing `fetchFreshFinds` (same premium gate, same
  48 h window), limit 40.
- Auctions pool = the existing `fetchAuctionsEndingSoon` (same time-tier +
  quality ranking), limit 24.
- Under $25 pool = a `total_price <= 25` Buy-It-Now query through the **same
  `isDisplayableDeal` gate the main "All deals" grid uses** — reference /
  matching / language / condition guards all intact; only the premium 12 h
  exact-verification requirement is not applied (a $25 card is rarely a
  counterfeit target, and the main grid already surfaces these).
- Grid pool = the unchanged `fetchDealsPool` query (up to 2000 newest active
  English `displayable` rows).

`rankFlagshipDeals` is still called from exactly one shared place;
`premiumDisplayable(data)` is still used by exactly the three premium
fetchers; no deal-integrity module carries a P0.4.1 edit (regression-tested).

## Before -> after (offline, live prod active-deal pool, 2026-09-06)

**Like-for-like — the four lanes that exist in both** (flagship + Just Added +
auctions + grid preview; CURRENT grid = mean of 200 `Math.random` shuffles):

| Metric | CURRENT | P0.4.1 | change |
|---|---|---|---|
| Visible deal cards | 19 | 19 | — |
| Distinct species | 16.5 | **18** | **+1.5** |
| Distinct printings | 18.9 (0.15 dup) | **19 (0 dup)** | +variety |
| Distinct sets | 17.7 | 18 | +0.3 |
| Top-species share | 12.1% | **10.5%** | better |
| Repeated species | 2.5 | **1** | better |
| Repeated printings | 0.15 | **0** | better |
| Mean saving % | 44.3% | 41.9% | -2.4 pp |
| Median saving % | 46.7% | 43.3% | -3.4 pp |
| Mean saving $ | $210 | $145 | -$65 |
| Median saving $ | $32 | **$48** | +$16 |
| Mean age (days) | 1.97 | **1.69** | fresher |
| p90 age (days) | 6.34 | **4.32** | fresher |
| Fresh (< TTL/2) share | 68.6% | 57.9% | -10.7 pp |

**Full homepage (P0.4.1 adds the Under $25 lane):**

| Metric | CURRENT (19 cards) | P0.4.1 FULL (22 cards) |
|---|---|---|
| Distinct species | 16.5 | **21** |
| Distinct printings | 18.9 | **22 (0 dup)** |
| Distinct sets | 17.7 | **21** |
| Top-species share | 12.1% | **9.1%** |
| Repeated printings | 0.15 | **0** |
| Mean saving % | 44.3% | 44.0% |
| Median saving % | 46.7% | **50.4%** |
| Mean saving $ | $210 | $128 |
| Median saving $ | $32 | $37 |
| Price bands present | 5 | 5 (`<$25` 7, `$25-50` 7, `$50-100` 2, `$100-250` 3, `$250+` 3) |
| Mean age (days) | 1.97 | **1.50** |
| p90 age (days) | 6.34 | **3.85** |

Per lane (P0.4.1): flagship 55.2% mean / $325 saved (tile 1 = the single best
deal), auctions 61.3% / $217, Under $25 57.3% / $21, Just Added 15.3% / $12
(unchanged — a freshness footnote, not a savings lane), grid 38.4% / $85.

**Rotation evidence** (6 consecutive 3-hour buckets): flagship leads rotate
Emolga then Emolga/Charizard/Dragonite across tiles 2-4; Under $25 rotates
`Gardevoir/Gengar/Iron Thorns -> Gyarados/Mewtwo/Celebi -> ...`; grid stays
9/9 distinct species every bucket; `same bucket -> identical` holds; 0
cross-lane repeated printings across all five lanes.

## Read

Substantial variety improvement — **+1.5 species like-for-like, +5 species and
+3 sets on the full homepage, top-species share 12.1% -> 9.1%, zero repeated
printings, a whole price band (`<$25`) that was invisible is now curated** —
with **negligible quality degradation**: the flagship lane is actually
stronger (55% / $325, tile 1 anchored to the best deal), the full-homepage
**median saving rises to 50%**, and inventory is **fresher** (p90 age
6.3 -> 3.9 days). The mean-$ dip is rotation trading a few $600 vintage tiles
for $250-$325 ones plus the deliberately low-ticket Under $25 lane — not a
gate regression. No threshold, reference gate, or scanner setting was touched.

## Performance

- Homepage render (cached ISR): **~25 ms**, 353 KB HTML, HTTP 200.
- `fetchHomepageLanes`: one `unstable_cache` entry (45 s). On miss it runs 5
  bounded `deals`-table reads (flagship <=1000, fresh <=240, under $25 <=250,
  auctions <=120, grid <=2000) — roughly neutral vs the 4 separate cached
  fetchers it replaces, consolidated into one cache key. `buildHomepageLanes`
  is O(n) JS over the pools (microseconds).
- Filtered page-1 (`/?type=raw`): ~0.9 s on cold cache (the `fetchDealsPool`
  DB query, unchanged from before), cached thereafter.
- **Zero eBay Browse calls** from homepage rendering (regression-tested).

## Tests

- `npm run test:scanner` — **1308 / 1308 pass** (21 new in
  `tests/scanner/homepage-variety-p041.test.mjs`; 7 pre-existing homepage
  structure/analytics assertions re-pointed at the new lane contract without
  weakening their guarantees).
- `npm run test:seo` — **330 / 331** (the 1 failure is the pre-existing
  `lib/deals.js` set-aggregates flake documented in section 14, untouched by
  P0.4.1).
- `npm run build` — **Compiled successfully, 44/44 static pages.**

## Not done (deferred, as scoped)

P0.4.2 scanner allocation, GSC audit, 13E.5, Reddit, publishing.

---

# P0.4.2 - Scanner allocation + long-tail inventory depth (implemented)

Scope: **scan-target allocation only.** No deal-qualification threshold,
market-reference confidence, P0.3.1 multi-card / language / grade guards,
exact-printing matching, availability gates, counterfeit/risk rules, price
calculations, affiliate logic, P0.4.1 homepage logic, SEO or publishing is
touched. It re-shapes WHICH already-qualified cards get scanned and HOW
OFTEN, inside the SAME Browse-call envelope. **Zero new Browse calls.**

## The old shape (removed)

| Lane | Old cadence | Problem |
|---|---|---|
| `tier=priority` | 26 cards x 6 marketplaces, every 6h (4 runs/day) | ~4,368 Browse calls / 7d on **17 real printings** - sweep already covers these; pure re-confirmation |
| `tier=extended` | 8,383 cards hash-chunked into 5, ONE (chunk,country) per day | a given extended card re-scanned **~once / 30 days / market** -> its deals expire and are never re-found |
| cron entries | 31 (1 priority + 30 monthly extended) | |

## The new shape - one evidence-based priority queue

`lib/scanAllocator.js` (pure, deterministic, 28 unit tests). `tier=priority`
and `tier=extended` are **merged**; the `watchlist.tier` column is now
advisory. `vercel.json` calls **`?tier=allocated&country=EBAY_XX` twice a
day per marketplace** (6 cron entries, 12 runs/day). Each run asks the
allocator which cards to scan in that one marketplace, from
`scan_target_state` (one row per (card,market): `last_searched_at`,
`last_deal_at`, `searches_since_deal`, `consecutive_no_new`,
`last_unique_listings`, `expired_deal_boost_until`), within a **quota-safe
budget**.

### State (deterministic, evidence-based)

| State | Rule | Revisit cadence |
|---|---|---|
| **HOT** | real deal here in the last 5d, or >=8 distinct listings last search | ~1.5d |
| **WARM** | deal in the last 21d, or >=3 distinct listings | ~4d |
| **NORMAL** | otherwise | ~12d |
| **LONG_TAIL** | not searched here for >=18d, or never searched (checked FIRST so an overdue card always surfaces) | ~21d |
| **DECAY** | `consecutive_no_new >= 4` AND `searches_since_deal >= 6` -> a HOT/WARM card that keeps coming back empty is forced down to NORMAL | |

### Every run is split three ways (so all goals hold regardless of backlog)

| Lane | Share | Ranked by | Guarantees |
|---|---|---|---|
| **HOT reserve** | 16% | priority score | a proven producer keeps its fast revisit even while a long-tail backlog clears |
| **EXPLORE** | 62% | pure least-recently-searched (never-searched first), **no yield input** | long-tail fairness - nothing starves; a "newly hot" card that historically produced nothing is still discoverable |
| **EXPLOIT** | remainder | blended score `0.5*overdue + 0.32*yield + 0.18*state` (+0.6 expired-boost) | productive cards float up as the backlog clears |

Deterministic tiebreak: `card_tcgplayer_id`. Same inputs -> same selection,
same order.

### Quota safety (§13)

`budgetForRun` = `min(TARGET_BUDGET_BASE(125) x marketplace_weight, remaining
- floor(1200), RUN_HARD_CAP(380))`. It **never spends past `remaining -
floor`**, **never grows because more targets exist**, and returns **0** when
there is no headroom - the run then does nothing and the next cron slot
resumes. `RATE_LIMIT_FLOORS.allocated = 1200`.

### Marketplace allocation (§8)

Weights from the P0.4 audit's measured supply + yield (US ~62% of deals, GB
carries the external board):

| | US | GB | AU | CA | DE | IT |
|---|---|---|---|---|---|---|
| weight | 1.6 | 1.2 | 1.05 | 1.05 | 0.95 | 0.9 |

Spread is deliberately modest (US/IT <= 2.2x). Every marketplace has 2 runs
a day and a hard exploration floor (`MIN_TARGETS_PER_RUN = 40`) - none is
silently starved. High-weight markets (US/GB) are cron-scheduled AFTER the
~07:00 UTC Browse-quota reset so they get full budget.

## §7 - recently-expired good-deal recheck

When `sweep-stale-deals` deactivates a **strong** deal
(`discount_pct >= 0.20` AND `market_price >= $60`, capped at 150/sweep), it
sets `scan_target_state.expired_deal_boost_until = now + 10 days` for that
exact **printing x marketplace**. The allocator adds `+0.6` to that
printing's score for 10 days - it re-checks for **NEW** listings (never the
dead listing), obeys the same run budget, expires on its own, and cannot
become a permanent tier (bounded count, bounded window).

## §9 - adaptive external-feed re-verify cooldown

P0.3.2's flat 20h `RECENT_VERIFY_HOURS` was shorter than how long a stale
reject sits on the (near-static) discovery board (~972 listings/week
re-verified >=2x). `lib/ingestFeedQueue.cooldownHoursFor` now:

| candidate | cooldown |
|---|---|
| seen once, no deal | 20h (unchanged) |
| **twice-failed, never a deal** | **84h** |
| ever became a deal | 20h (a real state change here must not be missed) |

## §10 - external-lane lot/bundle prefilter

`prefilterBoardCandidate` drops obvious lot / bundle / multi-quantity /
repack / mystery listings (deterministic title regex on the board hint)
**before** the expensive Browse verify - the external lane's measured yield
is ~1.1% and these are effectively never a single-card deal. Fails open
(no title -> the Browse call still decides).

## §14 - observability

`scan_allocation_runs` (one row per allocated run): marketplace, budget,
`by_state`, `by_lane`, explore/exploit/boosted counts, browse_calls,
deals_found, new_printings, p95_days_since_search of the pool,
never_searched_in_pool, rate_limit_remaining. Plus per-(card,market)
`scan_target_state`. Both writes are **best-effort** - a failure never
fails a scan (mirrors `logDiscoveryEvent`).

## §16 - fail-safe rollout

`SCAN_ALLOCATOR=off`, OR `scan_target_state` unreadable (migration not
applied / transient), -> the allocated branch falls back to **exactly the
old extended-chunk behaviour** for that country-day (`chunk = ((UTC day of
month - 1) % 5) + 1`, `tier='extended'` filter). So the deploy is safe
before the migration runs, the old allocator is one env var away, and the
new allocator **fails closed to safe quota behaviour**. Not a permanent
second implementation - a bounded deployment safety net.

## Before -> after: 30-day replay (`scripts/_p042sim.mjs`)

Live production watchlist (8,409 targets) + 7 days of `discovery_events`,
replayed 30 days under a **matched daily Browse envelope**.

| Metric | CURRENT | NEW | change |
|---|---|---|---|
| Browse calls / day (tiered allocation) | 1,724 | **1,688** | -2% (same envelope) |
| redundant <1d-fresh re-scans / 30d | 14,171 | **101** | **-99%** |
| priority-card searches / 7d / (card,market) pair | ~112 | **1.2** | the 26-card over-scan is gone |
| **p50 days since last search** (end state) | 16 | **11** | fresher |
| **p95 days since last search** (end state) | 30 | **23** | fresher long tail |
| **max days since last search** (end state) | 30 | **26** | |
| **% (card,market) pairs >18d unsearched** | 44.8% | **19.1%** | |
| distinct printings searched / 7d | 6,334 | 5,513 | see note |
| watchlist coverage / 30d | 100% | 100% | full rotation preserved |
| productive (card,market) pairs reached | 1,674 | 1,669 | no deal-opportunity loss |
| NEW selection mix / 30d | - | explore 35,766 / exploit 14,874; by-state hot 6.1k / warm 8.7k / long_tail 35.6k | |

Marketplace Browse calls / 30d: US 11,503 -> 12,000, GB 8,042 -> 9,000,
AU 8,042 -> 7,860, CA 8,042 -> 7,860, DE 8,042 -> 7,140, IT 8,042 -> 6,780.

**Note on 7d "distinct printings searched" (6,334 -> 5,513):** the old chunk
model does big weekly *bursts* (~1,677 cards in one run) then leaves them
untouched for 30 days; the new allocator spreads the same budget evenly, so
a 7-day snapshot flatters the burst model while the 30-day steady state
flatters the allocator (nothing sits >26 days, `p95` 30 -> 23,
`>18d-unsearched` 45% -> 19%). The **productive** coverage - printings that
actually produced a scan-logged deal - is unchanged. This is the intended
trade: even, fresh long-tail coverage instead of stale bursts.

### Simulated options (`EXPLORE_RATIO`)

| option | explore share | p95 days-since-search | HOT revisit | verdict |
|---|---|---|---|---|
| CONSERVATIVE | 0.50 | ~27 | fastest | modest tail gain |
| **BALANCED (chosen)** | **0.62** | **~23** | ~1.5d for HOT-due | clear tail gain, HOT cadence intact |
| AGGRESSIVE | 0.78 | ~19 | slower | best tail, HOT revisit slips |

## §17 tests / build

- `npm run test:scanner` - **1336 / 1336 pass** (28 new in
  `tests/scanner/scan-allocator-p042.test.mjs`; deterministic selection,
  no starvation under budget, HOT decay, expired-boost expiry, quota-floor
  protection, marketplace floors, adaptive cooldown, lot prefilter, source
  guards).
- `npm run test:seo` - **330 / 331** (the 1 failure is the pre-existing
  `lib/deals.js` set-aggregates flake from section 14, untouched by P0.4.2).
- `npm run build` - **Compiled successfully, 44/44 static pages.**

## §18 production verification - PENDING

The migration (`supabase/scan_allocator_migration.sql`) must be applied
before the allocator activates; until then every `?tier=allocated` run
falls back to the old extended-chunk behaviour (safe). After the migration
+ first allocated cron:

- **PENDING**: allocator executing / quota protection active / target
  breadth increasing / marketplace queues populated / old 26-card
  over-scan reduced - all read from `scan_allocation_runs` +
  `scan_target_state` + the run response JSON.
- **PENDING (7-30d)**: `p95_days_since_search` trending toward ~23, live
  active-deal pool depth, external-lane calls-saved from §9/§10.

## §9 P0.3.2 updated verdict: **HEALTHY**

The re-verify churn is now addressed at the root: the WATCH item from the
P0.4 audit (20h skip < board dwell) is fixed by the adaptive cooldown
(stable twice-failed rejects back off to 84h) plus the lot prefilter.
Estimated ~1,000 avoidable Browse calls/week reclaimed; production
confirmation PENDING.

## What was NOT changed

Deal threshold (0.1), reference-sanity, condition pricing, language /
collector-number / grade matching, seller-trust floor,
proxy/counterfeit filter, the P0.4.1 homepage, SEO, publishing, the
sweep lane, and the eBay Browse-quota floor/guard. The allocator picks
targets; `scanCardInMarketplace`'s gate chain runs on each exactly as
before.
