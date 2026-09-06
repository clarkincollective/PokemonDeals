# SEO-GSC-1 — Google Search Console indexation + organic visibility audit

**Date:** 2026-09-06
**Property:** `https://pokemondealfinder.com/` (URL-prefix, permission `siteOwner`)
**Data source:** live Google Search Console API (read-only OAuth,
`webmasters.readonly`) via `scripts/gsc-auth.mjs` / `scripts/gsc-test.mjs`
/ `scripts/_gscAudit.mjs`. Also live production HTML fetches and the
project database.

Labels used throughout:
**[GSC]** = fact from Search Console · **[PROD]** = fact from live
production / repo · **[INFER]** = inference · **[REC]** = recommendation
(not implemented — this phase is diagnostic).

---

## 0. Headline

**[GSC]** The property has **13 days of data** (first date 2026-08-25;
sitemap submitted 2026-08-26). All-time: **3 clicks, ~590–680
impressions**. There is effectively **no history to compare against** —
the previous 28-day window is empty.

**[INFER]** This is a brand-new, near-zero-authority domain that Google
began crawling ~2 weeks ago. The external audit's premises are **false**:
there IS a sitemap (index + 6 children, 26k URLs, 0 errors, downloaded
yesterday) and the pages ARE server-rendered (full HTML + structured data
to Googlebot). Its *observation* — the deep catalogue is mostly not
indexed yet — is **correct**, but the cause is **new-domain crawl
rationing**, not a technical defect. 173 distinct `/cards/` pages are
already receiving impressions.

---

## 1. GSC property

| | |
|---|---|
| **[GSC]** property | `https://pokemondealfinder.com/` (URL-prefix) |
| permission | `siteOwner` |
| also on the account | `https://interviewready.madethis.app/` (unrelated — not used) |
| connection | works; access token auto-refreshed from the stored refresh token |
| latest data date | 2026-09-06 (with `dataState=all`); ~2026-09-03 for finalised |
| earliest data date | **2026-08-25** |
| sitemaps known to Google | `https://pokemondealfinder.com/sitemap.xml` (index), submitted 2026-08-26, last downloaded **2026-09-05 20:02Z**, `isSitemapsIndex=true`, warnings 0, errors 0, contents `web submitted 26074 / indexed 0` |
| property/domain mismatch | none |

**[INFER]** `indexed: 0` in the Sitemaps API is a long-deprecated field
that the API returns as 0 for essentially every property; it is **not**
evidence that zero pages are indexed (URL Inspection below shows many
indexed pages). The reliable signals are `lastDownloaded` (fresh),
`errors: 0`, and the impression data.

---

## 2. Organic performance snapshot

**[GSC]** (`searchAnalytics/query`, `dataState=all`)

| window | dates | clicks | impressions | CTR | avg pos |
|---|---|---:|---:|---:|---:|
| Last 7 days | 2026-08-31 → 09-06 | 3 | 428 | 0.70% | — |
| Last 28 days | 2026-08-10 → 09-06 | 3 | 591 | 0.51% | — |
| Previous 28 days | 2026-07-13 → 08-09 | **0** | **0** | — | — |
| Last 3 months | 2026-06-08 → 09-06 | 3 | 591 | 0.51% | — |
| Max (16 mo) | 2025-05-01 → 09-06 | 3 | 591 | 0.51% | — |

- **28d vs previous 28d:** clicks 0 → 3 (n/a), impressions 0 → 591 (n/a).
  No baseline exists.
- **[GSC]** Impressions are accelerating: **428 of the 591** all-time
  impressions fall in the **last 7 days**. Trajectory is a normal
  new-site ramp, not a decline.
- **[GSC]** Only page with clicks: the homepage (3 clicks, pos ~5.4).

---

## 3. Route-family performance

**[GSC]** Page-dimension pull, 2026-08-20 → 09-06 (682 impr / 3 clicks /
**261 distinct pages with ≥1 impression**):

| route family | pages w/ impressions | impressions | clicks | CTR | avg pos | best pos |
|---|---:|---:|---:|---:|---:|---:|
| `/cards/` | **173** | 312 | 0 | 0% | 24.0 | 1 |
| `/deals/[id]` | 47 | 132 | 0 | 0% | 16.7 | 2 |
| `/guides/` | 5 | 96 | 0 | 0% | 35.6 | 6 |
| `/` (+ param variants) | 14 | 43 | 3 | 6.98% | 5.4 | 1 |
| `/sets/` | 10 | 36 | 0 | 0% | 45.1 | 4 |
| `/pokemon/` | 4 | 31 | 0 | 0% | 60.7 | 48 |
| `/about` | 1 | 10 | 0 | 0% | 5.6 | 5.6 |
| `/methodology` | 1 | 7 | 0 | 0% | 2.7 | 2.7 |
| `/search` | 1 | 6 | 0 | 0% | 16.7 | 16.7 |
| `/best-finds` | 2 | 4 | 0 | 0% | 54 | 48 |
| `/deals/under-25` | 1 | 2 | 0 | 0% | 7 | 7 |
| `/privacy` | 1 | 2 | 0 | 0% | 6.5 | 6.5 |
| `/sealed-deals/` | 1 | 1 | 0 | 0% | 3 | 3 |

**[GSC]** The catalogue (`/cards/`) is the **largest** impression family
by pages and by volume — it is *not* invisible. `/deals/[id]` is second.
`/pokemon/` and `/sets/` are barely present (4 and 10 pages).

---

## 4. Indexation / coverage

**[GSC — tool limitation]** The Search Console API exposes **no aggregate
Pages/Indexing (Coverage) report.** Available: `searchAnalytics/query`,
`sitemaps.list`, and **URL Inspection (one URL at a time)**. Aggregate
per-reason counts cannot be pulled; the URL Inspection sample below is the
substitute.

**[GSC]** URL Inspection sample (2026-09-06):

| URL | verdict | coverageState | lastCrawl | Google canonical |
|---|---|---|---|---|
| `/` | PASS | **Submitted and indexed** | — | self |
| `/sets` | PASS | **Submitted and indexed** | — | — |
| `/guides` | PASS | **Submitted and indexed** | — | — |
| `/guides/how-pokemon-card-prices-work` | PASS | Submitted and indexed | — | — |
| `/guides/card-condition-grading` | PASS | Submitted and indexed | — | — |
| `/cards/pikachu-v-full-art-swsh04-vivid-voltage` | PASS | Submitted and indexed | 2026-09-02 | self (== user) |
| `/cards/houndoom-ex-full-art-xy-breakthrough` | PASS | Submitted and indexed | — | — |
| `/cards/kakuna-base-set-shadowless` | PASS | Submitted and indexed | — | — |
| `/cards/radiant-charizard-020-159-prize-pack-series-cards` | PASS | Submitted and indexed | — | — |
| `/deals/21270` | PASS | Submitted and indexed | 2026-08-28 | self |
| `/deals/6486` | PASS | Submitted and indexed | 2026-08-27 | self |
| `/pokemon` (index) | NEUTRAL | **Discovered – currently not indexed** | null | — |
| `/cards` (index) | NEUTRAL | **Discovered – currently not indexed** | null | — |
| `/cards/charizard-base-set` | NEUTRAL | **Discovered – currently not indexed** | **null** | — |
| `/pokemon/charizard` | NEUTRAL | Discovered – currently not indexed *(was "unknown" 10 min earlier)* | null | — |
| `/pokemon/pikachu` | NEUTRAL | Discovered – currently not indexed | null | — |
| `/pokemon/lickitung`, `/pokemon/houndoom` | NEUTRAL | Discovered – currently not indexed | null | — |
| `/sets/base-set`, `/sets/aquapolis` | NEUTRAL | Discovered – currently not indexed | null | — |
| `/sets/sv08-surging-sparks` | NEUTRAL | URL is unknown to Google | null | — |

**[GSC]** Every indexed page checked: `robotsTxtState=ALLOWED`,
`pageFetchState=SUCCESSFUL`, `indexingState=INDEXING_ALLOWED`,
`crawledAs=MOBILE`, Google-chosen canonical **==** user-declared
canonical. **No** robots-blocked, noindex, soft-404, redirect, canonical,
or server-error exclusions were observed on any catalogue URL.

**[INFER]** The non-indexed catalogue URLs are all
**"Discovered – currently not indexed" with `lastCrawl = null`** — Google
has the URL (from the sitemap) but **has not fetched it yet**. That is a
crawl-scheduling state, not a quality rejection or a technical block. On a
13-day-old domain with a 26k-URL sitemap this is the expected state for
the long tail.

---

## 5. Representative URL inspection

Covered in §4. Highlights:

- **[GSC]** `/cards/pikachu-v-full-art-swsh04-vivid-voltage` is indexed,
  last crawled 2026-09-02, **referred by another card page**
  (`/cards/talonflame-v-swsh04-vivid-voltage`) → card→card internal links
  (RelatedCards) are being followed and are passing equity.
- **[GSC]** `/cards/charizard-base-set` (a flagship page) — discovered,
  **never crawled**; the only referring URL GSC reports is a homepage
  filter permutation `/?listing=FIXED_PRICE&page=2&country=EBAY_GB`.
- **[GSC]** `/pokemon/charizard` — discovered ~today, never crawled, **no
  referring URLs reported** despite the `/pokemon` index linking it.
- **[GSC]** `/pokemon/pikachu` — discovered, never crawled, referring URL
  is `/deals/17642` (a churny deal page).
- **[GSC]** `/deals/21270`, `/deals/6486` — indexed; **not** in any
  sitemap (`sitemap: none`); referred by homepage param URLs /
  `/best-finds`. **[PROD]** both now return
  `<meta robots="noindex, follow">` + "This deal has ended" — they are
  expired and will drop on Google's next recrawl.

---

## 6. Sitemap verification

**[PROD]** Live architecture (all fetched 2026-09-06):

| sitemap | HTTP | `<loc>` count | `<lastmod>` |
|---|---|---:|---|
| `/sitemap.xml` (index) | 200 | 6 children | — |
| `/sitemaps/pages.xml` | 200 | 31 | — |
| `/sitemaps/sets.xml` | 200 | 208 | — |
| `/sitemaps/pokemon.xml` | 200 | 910 | none |
| `/sitemaps/cards.xml` | 200 | **23,619** | none |
| `/sitemaps/deals.xml` | 200 | 865 | on every entry |
| `/sitemaps/sealed-deals.xml` | 200 | 551 | — |
| **total** | | **26,182** | |

- **[PROD]** All route families represented. `pages.xml` includes home,
  9 deal-category landings, 3 catalogue landings, `/japanese-cards`,
  `/sealed-deals`, `/search`, `/guides` + the **4 guides**, 6 info pages,
  `/market-data` + 3.
- **[PROD/INFER]** Noindex URLs are excluded: `card_catalog` holds
  **29,342** rows but `cards.xml` has **23,619** → ~5,723 price-less /
  thin cards are correctly `noindex` and omitted (matches the card-hub
  `generateMetadata` "too thin to index" gate). Expired `/deals/[id]` are
  absent (865 live vs 24,472 all-time deal rows).
- **[GSC]** Google processed the index: `lastDownloaded 2026-09-05`,
  errors 0, warnings 0, submitted 26,074 (≈ the 26,182 live, minus churn).
- **[INFER]** No submitted-vs-indexed discrepancy can be read from the API
  (the field is always 0). No discrepancy is *implied* by any other
  signal — crawling is simply in progress.

**Verdict: HEALTHY.** Do not rebuild. One structural weakness (§17): a
single flat 23,619-URL `cards.xml` with no `<lastmod>`/`<priority>` gives
Google no signal about which cards to crawl first.

---

## 7. Robots / meta robots / canonical

**[PROD]**

```
robots.txt:
  User-Agent: *
  Allow: /
  Disallow: /api/
  Sitemap: https://pokemondealfinder.com/sitemap.xml
```

| URL | HTTP | meta robots | canonical |
|---|---|---|---|
| `/cards/charizard-base-set` | 200 | *(none = index)* | self |
| `/pokemon/charizard` | 200 | *(none)* | self |
| `/sets/base-set` | 200 | *(none)* | self |
| `/guides/how-pokemon-card-prices-work` | 200 | *(none)* | self |
| `/deals/6486` (expired) | 200 | `noindex, follow` | *(none)* |
| non-existent guide slug | 404 | `noindex` | — |

**Verdict: HEALTHY.** Catalogue is crawlable and indexable; expired deals
and thin pages correctly `noindex,follow`; canonicals are self-referential
and Google agrees on every indexed page checked.

---

## 8. Raw HTML / SSR verification

**[PROD]** Fetched with a Googlebot UA, **no JavaScript executed**:

| URL | HTTP | raw bytes | `<title>` | `<h1>` | JSON-LD | internal `<a href="/…">` |
|---|---|---:|---|---|---|---:|
| `/cards/charizard-base-set` | 200 | 141 KB | "Charizard #004/102 (Base Set) Price & Value \| …" | "Charizard — Base Set Price & Value" | Product, Offer, Breadcrumb, Brand, Organization, WebSite | 60 |
| `/pokemon/charizard` | 200 | 636 KB | "Charizard Card Prices & Values \| …" | "Charizard Card Prices & Values" | ItemList, Breadcrumb, Organization, WebSite | 529 |
| `/sets/base-set` | 200 | 426 KB | "Base Set Card List, Prices & Values \| …" | "Base Set Card List, Prices & Values" | CollectionPage, ItemList, Breadcrumb | 364 |
| `/guides/how-pokemon-card-prices-work` | 200 | 55 KB | "How Pokemon Card Prices Are Determined \| …" | "How Pokemon Card Prices Are Determined" | (article/org) | — |

Every catalogue page's raw HTML contains its identity (name / set /
number), descriptive content, price/offer data (Product + Offer JSON-LD
on `/cards/`), structured data, and a large internal-link block —
**before any client hydration.**

**Verdict: HEALTHY (SSR/ISR).** The "suspected client-side rendering"
claim is disproven.

---

## 9. Top queries

**[GSC]** 2026-08-20 → 09-06, `query` dimension — 165 queries produced
203 impressions (the ~480 remaining impressions have the query withheld
by Google as anonymised). **0 clicks on any keyed query.** Top by
impressions:

| query | impr | pos | theme |
|---|---:|---:|---|
| arcanine shadowless | 5 | 13 | card identity |
| lickitung aquapolis | 4 | 9.5 | card identity |
| pokemon card ratings | 4 | 76.5 | guide/info |
| shadowless arcanine | 4 | 24 | card identity |
| base set charizard worth | 3 | 43.3 | card value |
| glaceon 171 promo | 3 | 10 | card identity |
| what are vintage pokemon cards | 3 | 57.7 | guide/info |
| absol ex silver border | 2 | 10 | card identity |
| houndoom ex price | 2 | 51.5 | card value |
| how much is a houndoom pokemon card worth | 2 | 65 | card value |
| how much is riolu worth | 2 | 39.5 | card value |
| ninetales pokemon card value | 2 | 46 | card value |
| pokemon grades explained | 2 | 60.5 | guide/info |
| sword and shield promo cards list | 2 | 62.5 | set/list |
| every dragonite pokemon card / all dragonite cards list | 2 / 1 | 67 / 80 | set/list |
| mewtwo ex - me: 30th celebration | 2 | 11.5 | card identity |

Theme grouping of the 165 keyed queries:

| theme | approx share | maps to |
|---|---|---|
| **CARD PRICE / VALUE INTENT** ("X worth", "X price", "how much is X") | ~35% | `/cards/[slug]`, `/pokemon/[species]` |
| **CARD IDENTITY** ("arcanine shadowless", "glaceon 171 promo", "m gardevoir ex 79/114") | ~35% | `/cards/[slug]` |
| **SET / LIST INTENT** ("all dragonite cards list", "sword and shield promo cards list") | ~10% | `/pokemon/[species]`, `/sets/[slug]` |
| **GUIDE / INFORMATIONAL** ("pokemon grades explained", "what are vintage pokemon cards", "all pokemon card conditions") | ~15% | `/guides/*` |
| **DEAL INTENT** ("… deal", "cheap …", "… below market") | **~0%** | `/`, `/deals/*` |
| **BRAND** ("pokemon deal finder") | **0%** | `/` |

**[INFER]** Search demand reaching the site today is **card-value /
card-identity / grading-info**, not deal-hunting and not brand. That
aligns with `/cards/`, `/pokemon/` and `/guides/` — exactly the families
that most need crawl help.

Queries in striking range (**pos 4–20**, keyed): `lickitung aquapolis`
(9.5), `glaceon 171 promo` (10), `absol ex silver border` (10),
`mewtwo ex - me: 30th celebration` (11.5), `arcanine shadowless` (13),
`value` (20). All 1–5 impressions.

---

## 10. High-impression / low-CTR opportunities

**[GSC/INFER]** Not evaluable yet. The only page with impressions in a
click-capable position **and** meaningful volume is the **homepage**
(43 impr, pos 5.4, 3 clicks, CTR 7%). Every other page is either pos > 15
or has < 10 impressions — CTR is ~0 because of position and sample size,
not because of weak titles/meta. Re-evaluate once pages hold page-1
positions with double-digit impressions.

The `/guides/card-condition-grading` page (79 impr, pos ~55–90 across ~26
queries) is the clearest *future* title/CTR + content candidate, but it
needs to climb from page 6–9 first — that's a ranking problem, not a CTR
problem.

---

## 11. Striking-distance pages (pos ~4–20, ≥2 impressions)

**[GSC]** 53 pages qualify. Top:

| URL | theme | impr | clicks | pos |
|---|---|---:|---:|---:|
| `/deals/21270` | expired deal | 32 | 0 | 16.5 |
| `/` | home | 24 | 3 | 5.4 |
| `/about` | info | 10 | 0 | 5.6 |
| `/deals/8269` | expired deal | 10 | 0 | 8.9 |
| `/cards/houndoom-ex-full-art-xy-breakthrough` | card | 8 | 0 | 16 |
| `/cards/pikachu-ex-xy124-xy-promos` | card | 7 | 0 | 8.1 |
| `/cards/popplio-045-me-mega-evolution-promo` | card | 7 | 0 | 13.9 |
| `/cards/moltres-12-fossil` | card | 5 | 0 | 7.2 |
| `/cards/kangaskhan-5-jungle` | card | 5 | 0 | 10.2 |
| `/cards/radiant-charizard-020-159-prize-pack-series-cards` | card | 3 | 0 | 4.0 |
| `/cards/pikachu-v-full-art-swsh04-vivid-voltage` | card | 4 | 0 | 5.3 |
| `/deals/29316` | expired deal | 3 | 0 | 4.0 |
| `/sets` | hub | 3 | 0 | 6.3 |
| `/cards/kakuna-base-set-shadowless` | card | 3 | 0 | 6.7 |
| … 39 more `/cards/*` at pos 6–19, 2 impr each | | | | |

**[INFER]** ~45 of the 53 are `/cards/[slug]` pages ranking pos 4–19 for
exact-card queries with 0 clicks — because volume is tiny and the domain
has no trust to earn a click at those positions. These are the seeds of
the eventual opportunity, not a fixable gap today.

---

## 12. Zero-visibility catalogue — indexable vs receiving impressions

**[PROD] indexable (sitemap) · [GSC] receiving ≥1 impression in the ~17-day
window (all data the property has):**

| family | indexable URLs | w/ ≥1 impression | **penetration** | indexed in sample |
|---|---:|---:|---:|---|
| `/cards/` | 23,619 | 173 | **0.73%** | mixed (high-interest cards yes; flagship `charizard-base-set` not yet crawled) |
| `/pokemon/` | 910 | 4 (`dragonite` 22, `cleffa` 6, `electrode` 2, `growlithe` 1) | **0.44%** | none in sample; index page not crawled |
| `/sets/` | 208 | 10 (`sv10-destined-rivals` 16, …) | **4.8%** | index page indexed; most set pages not crawled |
| `/guides/` | 4 | 4 (+ `/guides` index) | ~100% | all indexed |
| `/deals/[id]` | 865 live | 47 | 5.4% | some indexed (incl. expired, pending recrawl) |
| `/sealed-deals/` | 551 | 1 | 0.2% | — |

**[INFER]** "Indexed ≠ receiving impressions" holds strongly here, but the
dominant explanation is **not crawled yet** (URL Inspection: `lastCrawl =
null` on the deep tail), layered on **13 days of data** and **~zero
domain authority**. Penetration will only be a meaningful metric after
several more weeks of crawling.

---

## 13. Content-quality signal

**[PROD]** Compared an indexed card page
(`/cards/pikachu-v-full-art-swsh04-vivid-voltage`) with a
discovered-not-indexed one (`/cards/charizard-base-set`): **structurally
identical** — same template, both full SSR HTML, both with real title/H1,
Product+Offer JSON-LD, price/condition data, 60+ internal links, price
history. The non-indexed one simply has not been crawled.

The ~5,723 `card_catalog` rows **excluded** from the sitemap (no
trustworthy market price) *are* genuinely thin — and they are already
`noindex` and omitted. That gate is working.

**Content quality verdict: NOT PROVEN as a blocker.** No evidence that
template thinness is causing non-indexation of the sitemap'd catalogue.
(Re-test once a representative sample of `/cards/` and `/pokemon/` pages
has actually been crawled and *then* excluded — only that would implicate
content.)

---

## 14. Internal-link discovery

**[PROD]** raw-HTML link fan-out:

| page | links out |
|---|---|
| `/pokemon` (index) | **1,025** `/pokemon/[species]` links (all of them) |
| `/sets` (index) | **208** `/sets/[slug]` links (all of them) |
| `/cards` (index) | 24 `/cards/` + 24 `/pokemon/` + 24 `/sets/` (paginated browse, not a full hub) |
| `/` (home) | `/sets` `/pokemon` `/guides` (×3 each), `/cards`, `/deals`, `/best-finds`, `/japanese-cards`, `/sealed-deals`, ~40 specific `/sets/[slug]`, ~4 specific `/cards/[slug]` |
| `/cards/[slug]` | ~60 internal links incl. RelatedCards (card→card) |

- **[GSC]** No **orphans** in the classic sense — `/pokemon` links every
  species, `/sets` links every set, card→card links are followed
  (`pikachu-v-full-art` was discovered via `talonflame-v`).
- **[GSC — the real gap]** `/pokemon` index and `/cards` index are
  **"Discovered – currently not indexed" (never crawled)**. The species
  tree therefore currently has **no crawled parent**, so `/pokemon/[species]`
  pages are only reachable via the raw sitemap. `/pokemon/charizard`
  reports **zero referring URLs**.
- **[GSC]** The referring URLs Google *does* record for deep pages are
  churny / parameterised (`/?listing=FIXED_PRICE&page=2&country=EBAY_GB`,
  `/?maxPrice=50&page=2`, `/deals/17642`) — low-value, partly `nofollow`,
  and (for deal links) disappearing on expiry.

**Internal-linking verdict: P1.** Not broken, but the crawl-equity path
to the deep catalogue runs through (a) two un-crawled index pages and
(b) ephemeral deal/param links.

---

## 15. Deal-URL crawl behaviour

**[GSC]** 47 `/deals/[id]` pages received impressions (132 total). A few
expired IDs (6486, 8269, 12603, 21270) are **still indexed**, last
crawled 2026-08-27/28, `sitemap: none`.
**[PROD]** All expired deal pages return `<meta robots="noindex, follow">`
+ "This deal has ended"; `deals.xml` contains only the 865 currently-live
deals.
**[INFER]** The mechanism to shed expired deal URLs works
(noindex,follow + sitemap removal); the lingering indexed ones are simple
recrawl lag and will drop. There is **no evidence** that deal URLs are
consuming crawl budget at the expense of the stable catalogue — deal
pages are a small minority of impressions and the catalogue is being
discovered in parallel.

**Verdict: HEALTHY.**

---

## 16. Guides opportunity

**[GSC]** guide performance (~17 days):

| guide | impr | avg pos | notable queries (pos) |
|---|---:|---:|---|
| `/guides/card-condition-grading` | **79** | ~64 | "pokemon card ratings" (76), "pokemon grades explained" (60), "pokemon card condition guide" (78), "grade 9 pokemon card meaning" (68), "what is a grade 7 pokemon card" (59), "how to check the grade on a pokemon card" (56) — **~26 distinct condition/grading queries** |
| `/guides/raw-vs-graded-pokemon-cards` | 7 | 40.6 | "graded vs ungraded pokemon cards" (44), "raw vs graded" (54) |
| `/guides/vintage-vs-modern-pokemon-cards` | 7 | 43.4 | "what are vintage pokemon cards" (57.7) |
| `/guides/how-pokemon-card-prices-work` | 2 | 24 | "how do pokemon cards get their value" (38) |
| `/guides` (index) | 1 | 6 | — |

**[INFER] evidence-backed guide opportunities:**
1. **Card condition & grading** — clear, broad demand (79 impr / ~26
   queries on one page). Strengthen/expand this cluster: grade-scale
   explainer ("what is a grade 7/8/9"), "how to check a card's grade",
   PSA vs CGC vs BGS.
2. **"How much is my card worth" / how card values are set** — matches
   the dominant query theme (§9) and the existing pricing guide (pos 24
   already).
3. **Set / "all X cards" list intent** ("all dragonite cards list",
   "sword and shield promo cards list") — currently landing on
   `/pokemon/[species]` and `/sets/[slug]` at pos 60–80; a guide is
   likely the wrong tool, but it confirms the species/set pages target
   real demand.

Do not create guides in this phase.

---

## 17. Root-cause ranking

| area | verdict | basis |
|---|---|---|
| Technical indexation | **HEALTHY** | 200s, `INDEXING_ALLOWED`, `pageFetchState=SUCCESSFUL`, canonical agreement on every indexed URL |
| Sitemap discovery | **HEALTHY** | index + 6 children all 200, 0 errors, downloaded 2026-09-05, 26k URLs, noindex excluded |
| Robots | **HEALTHY** | `Allow: /`, only `/api/` blocked |
| Canonicalisation | **HEALTHY** | self-canonical; Google canonical == user canonical on all indexed samples |
| SSR / raw HTML | **HEALTHY** | full server HTML + Product/Offer/ItemList JSON-LD + link blocks to Googlebot, no JS needed |
| Domain authority / backlinks | **P0** | 13-day-old domain, no brand queries, no external signals — the actual gate on how much of a 26k sitemap Google will crawl |
| Crawl-budget pressure | **P1** | 23,619-URL flat `cards.xml`, no `<lastmod>`/`<priority>` on cards/pokemon → no crawl-priority signal; deep tail all `lastCrawl=null` |
| Internal linking | **P1** | `/pokemon` + `/cards` index pages not yet crawled → species tree has no crawled parent; deep-page referrers are churny param/deal URLs |
| Catalogue content depth | **NOT PROVEN** | indexed vs non-indexed card pages structurally identical; thin priceless cards already excluded |
| Title / meta CTR | **NOT PROVEN** | positions too deep + volume too low; only the homepage has clicks |
| Thin programmatic pages | **HEALTHY / NOT PROVEN** | ~5,723 price-less cards already `noindex` + sitemap-excluded |
| Guide coverage | **P1 (opportunity)** | only 4 guides; grading guide shows 79 impr / ~26 queries of unmet demand |
| Deal-URL crawl behaviour | **HEALTHY** | noindex,follow on expiry + sitemap removal working; no evidence of catalogue harm |

**Biggest bottleneck:** a **new, zero-authority domain** whose 26k-URL
sitemap Google is crawling slowly and without priority guidance. Nothing
technical is broken.

---

## 18. Priority opportunities (evidence-backed, NOT implemented)

| # | opportunity | expected impact | confidence | effort | GSC evidence | proposed next action |
|---|---|---|---|---|---|---|
| 1 | **Get `/pokemon` & `/cards` index pages crawled + indexed** (they're the crawled parents the species/card tree lacks) | Medium — unlocks a crawl path to 910 species + a browse path to 23.6k cards | High | Low | both = "Discovered – not indexed", `lastCrawl null`; `/sets` index *is* indexed and 10 set pages already surface | request indexing on both; add prominent homepage/header links to `/pokemon` (currently only text links ×3); trim the 1,025-link `/pokemon` page to a paginated/grouped structure Google will actually crawl through |
| 2 | **Add crawl-priority signals to the catalogue sitemaps** | Medium — steers limited crawl to the cards that can rank | High | Low–Med | 23,619 URLs in one file, no `<lastmod>`/`<priority>`; deep tail all `lastCrawl null` | split `cards.xml` into shards (e.g. by set or by value band), add `<lastmod>` (price-history updated date) and `<priority>` weighted by market value / watchlist presence |
| 3 | **Strengthen the card-condition/grading guide cluster** | Medium — one page already pulls 79 impr / ~26 queries at pos 55–90 | High | Med | §16 table | expand grade-scale coverage, add "how to check a card's grade" + "PSA vs CGC vs BGS"; interlink with `/guides` index and card pages |
| 4 | **Point stable internal links at high-value species/sets** | Low–Med — replaces churny/param referrers with durable equity | Med | Low | deep-page referrers are `/?…param…` and expiring `/deals/[id]` | on `/cards/[slug]` and `/deals/[id]`, link the card's species hub and set hub in-body (not just breadcrumb); add a "popular species / popular sets" block to the homepage |
| 5 | **Earn 3–10 authoritative backlinks** | High — the real crawl-budget gate | High (mechanism) / Low (control) | High | 0 brand queries, 0 referring domains implied, new domain | (out of scope this phase — 13E.5 / outreach) note as the #1 dependency |
| 6 | **`/pokemon/[species]` "all X cards" intent** | Low–Med | Med | Low | "all dragonite cards list", "every dragonite pokemon card", "sword and shield promo cards list" at pos 60–80 hitting `/pokemon/dragonite`, `/sets/…promo…` | ensure these pages' `<title>`/H1 include "all … cards / card list" phrasing; verify the full card list is in SSR HTML |
| 7 | **Homepage is the only converting page — protect & extend it** | Low (absolute) | High | Low | `/` = 3/3 clicks, pos 5.4 | keep; add internal links from `/` deeper into `/cards` value pages so equity flows |
| 8 | **Expired-deal recrawl hygiene** | Low | Med | Low | `/deals/6486` etc. still indexed post-expiry | optional: 410 (not 200+noindex) for long-expired deal IDs to speed removal — low priority, current handling is acceptable |
| 9 | **Re-baseline in 4–6 weeks** | — (measurement) | High | Low | only 13 days of data; impressions 0→428/wk | re-run `scripts/_gscAudit.mjs` for the same families; compare penetration + `lastCrawl` coverage |
| 10 | **Submit child sitemaps individually in GSC** | Low | Med | Very low | only the index is submitted; per-child coverage not visible | add `/sitemaps/cards.xml`, `/sitemaps/pokemon.xml`, `/sitemaps/sets.xml` as separate submissions for per-family reporting |

---

## 19. Manual GSC actions genuinely required

**None are strictly required** — nothing is broken. Two are *useful* and
low-effort:

1. **Submit the child sitemaps individually** (`/sitemaps/cards.xml`,
   `pokemon.xml`, `sets.xml`) alongside the index, so GSC reports
   coverage per family.
2. **Request indexing** for `/pokemon` and `/cards` (the un-crawled index
   pages) to seed the crawl path.

Everything else is a code/content change (opportunities §18), to be
scheduled in a later phase — not this one.

---

## Appendix — tooling

- `scripts/gsc-auth.mjs` / `scripts/gsc-test.mjs` — existing local
  read-only OAuth (`.secrets/gsc-oauth-client.json`,
  `.secrets/gsc-token.json`; git-ignored; never deployed). **Auth works**
  — access token auto-refreshed from the stored refresh token this
  session.
- `scripts/_gscAudit.mjs` — new read-only helper: `perf` (Search
  Analytics), `sitemaps` (list), `inspect` / `inspect-file` (URL
  Inspection API). No write scope, no Search Console mutation.
- Raw data captured: `scripts/_gsc_pages.json`, `_gsc_queries.json`,
  `_gsc_page_query.json`, `_gsc_inspect*.json` (git-ignored scratch).

---

# SEO-GSC-2 — crawl discovery + catalogue hub strengthening (implemented)

**Date:** 2026-09-07 · commit see §commit · **not** an indexation-bug
fix. Goal: improve Google's *discovery* and *crawl prioritisation* of the
stable catalogue without new low-value pages and without touching the SEO
system's architecture, canonicals, robots, indexability gates or sitemap
`<lastmod>`.

## What changed (3 code changes + 1 new component)

| # | change | file(s) | effect |
|---|---|---|---|
| 1 | **Footer "Browse" row** — a stable, server-rendered, always-visible (`no display:none`, no JS, no churn) nav row linking `/deals · /cards · /pokemon · /sets · /guides` | `components/SiteFooter.js` | every one of the ~24k card, ~900 species, ~200 set and every deal/guide page now carries a plain `<a href>` to each catalogue hub. GSC showed the only site-wide links to `/pokemon` and `/cards` lived in a **double-`display:none`** desktop header dropdown + a **click-gated** mobile portal — neither a strong crawl signal on a new domain. |
| 2 | **`/cards` fans out to the full set universe** — new `SetLinkIndex` server component (plain `<a>`, no `next/link`, A–Z grouped) renders **all ~208** `/sets/[slug]` hubs; `BROWSE_POKEMON` 24 → 60 | `app/cards/page.js`, `components/SetLinkIndex.js` | `/cards` becomes a real second crawl path into the set → card tree (`/cards → /sets/[slug] → /cards/[slug]`). Was 24 set links; the deep catalogue depended on the flat sitemap + expiring deal URLs. |
| 3 | **`/sets/[slug]` crawl index uncapped** — the plain-text `<CatalogueLinkIndex>` now receives the **full indexable** card list (`SET_LINK_INDEX_MAX = 2500`), while the image-heavy `<CatalogueBrowser>` keeps its 600-tile cap | `lib/deals.js` (`fetchSetCatalog` → new `indexCards`), `app/sets/[slug]/page.js` | closes the crawl-orphan gap: **1,168 indexable cards** (862 of them species-less, so no `/pokemon/[species]` parent either) sat past the 600 cap in 4 grab-bag "sets" with **no stable crawlable parent**. Filter is INDEXABLE-only (`hubSlug` or resolvable + non-sentinel price) — resolvable-but-priceless `noindex,follow` cards are still **not** advertised as crawl targets (brief §8: "do not blindly expose junk/thin pages"). |

No change to: robots.txt, canonicals, sitemap architecture / `<lastmod>` /
segmentation, indexability thresholds, deal-matching / authenticity /
freshness logic, or the P0.4.1 homepage variety selector.

## Before → after — crawl paths & link counts

**[PROD]** raw HTML (Googlebot UA), local `next start`:

| page | HTML bytes | `/pokemon/[slug]` links | `/sets/[slug]` links | footer hubs |
|---|---:|---:|---:|---|
| `/` | 359 KB → 360 KB | 12 | 25 | — → **5** (`/deals /cards /pokemon /sets /guides`) |
| `/pokemon` | 802 KB → 803 KB | 1,025 (unchanged) | 0 | — → **5** |
| `/cards` | **189 KB → 282 KB** | 24 → **60** | **24 → 208** | — → **5** |
| `/sets` | 431 KB → 432 KB | 0 | 208 | — → **5** |
| `/sets/base-set` (normal set) | 426 KB (unchanged) | 68 | 1 | — → **5** |
| `/sets/world-championship-decks` (grab-bag) | ~0.9 MB → **1.15 MB** | 295 | 0 | — → **5** |
| `/cards/charizard-base-set` | 141 KB (unchanged) | 1 | 1 | — → **5** |

`/sets/[slug]` crawlable `/cards/[slug]` links, oversized buckets:

| set | catalogue rows | indexable | `/cards/` links before (600-tile cap) | after (full text index) |
|---|---:|---:|---:|---:|
| World Championship Decks | 1,960 | 1,598 | ~600 | **1,587** |
| Prize Pack Series Cards | 886 | 647 | ~600 | **614** |
| Miscellaneous Cards & Products | 824 | 723 | ~600 | ~700 |
| League & Championship Cards | 617 | 551 | 551 | 551 |

Normal sets (≤600 catalogue cards — ~204 of 208) are unchanged.

### Crawl depth

| entity | shortest stable path before | after |
|---|---|---|
| species `/pokemon/[slug]` | `/` → header dropdown (`display:none`) → `/pokemon` → slug — dropdown links weak on a new domain | `/` → **footer** `/pokemon` → slug — depth 2, plain link on every page |
| set `/sets/[slug]` | same, via `/sets` (or 24-link `/cards` slice) | `/` → **footer** `/sets` **or** `/cards` (now 208-set index) → slug — depth 2 |
| card `/cards/[slug]` (has species) | `/pokemon/[species]` → slug (species page itself un-crawled) | `/sets/[slug]` **and** `/pokemon/[species]` → slug — depth 3, both parents now footer-reachable |
| card `/cards/[slug]` (species-less, in a grab-bag set, past #600) | **none** — sitemap / expiring deal link only | `/sets/[slug]` full text index → slug — depth 3 |

## Orphan state (§6)

| | before | after |
|---|---:|---:|
| indexable cards past the `/sets/[slug]` 600 cap (no stable parent from their set page) | **1,168** | 0 |
| — of those, species-less (**true** indexable orphans: no set-page and no species-page parent) | **862** | **0** |
| indexable species with a stable crawlable parent | 910 / 910 (via `/pokemon`, un-crawled) | 910 / 910 (via footer-linked `/pokemon`) |
| indexable sets with a stable crawlable parent | 208 / 208 | 208 / 208 (now also from `/cards`) |
| guides with a stable crawlable parent | 4 / 4 | 4 / 4 |

**Target of 0 indexable orphans: met.** The 862 species-less grab-bag
reprints match the pre-existing "~600–900 no-species reprint/specialty
cards" P2 watch — it was 862, now resolved by change #3.

## Sitemap `<lastmod>` decision (§9)

**No change — already truthful.** Audited `lib/sitemap.js`:

- `pages`, `sets`, `pokemon`, `cards` segments: **omit `<lastmod>`** — no
  per-URL content-modification timestamp exists we can stand behind (a
  bulk `card_catalog.synced_at` moves every row on every sync = the
  "everything changed at once" signal the code already rejects).
- `deals`, `sealed-deals` segments: `<lastmod>` = the listing's real
  `last_seen_at` from the scanner. Kept.
- Sitemap **index**: no child `<lastmod>` (a prior `Date.now()` stamp was
  removed pre-audit; `crawl-hygiene.test.mjs` locks this).
- No `Date.now()` / build-time / deploy-time timestamp anywhere.

Aligns with brief §1 ("no fake freshness") and §9 ("if no truthful
modification timestamp exists, omit lastmod").

## Sitemap segmentation decision (§10)

**No change — sharding not justified now.** `cards.xml` = 23,619 URLs,
well under the 50,000-per-file protocol limit. The only concrete benefit
of code-level shards (`cards-1.xml`…) would be per-shard GSC reporting —
which is available with **zero code** by submitting the existing child
sitemaps (`/sitemaps/cards.xml`, `pokemon.xml`, `sets.xml`) individually
in GSC alongside the index (SEO-GSC-1 §19 manual action). GSC (2026-09-06)
reported `errors 0, warnings 0` and a fresh `lastDownloaded` on the
index — no partial-processing signal. Revisit if `cards.xml` approaches
~40k URLs or GSC starts reporting it as partially processed.

## Guide-query opportunity — preserved for the NEXT content phase (§11)

**[GSC]** 2026-08-20 → 09-08, real queries hitting `/guides/*` (do not
fabricate — this is the exact set):

`/guides/card-condition-grading` (79 impr in SEO-GSC-1's window; **~24
distinct queries**, all pos ~55–90):

| theme | real GSC queries (verbatim) |
|---|---|
| **grade meaning / scale** | `what is a grade 7 pokemon card`, `grade 9 pokemon card meaning`, `what does grade mean in pokemon cards`, `what does it mean for a pokemon card to be graded`, `pokemon card condition scale` |
| **"explained" / overview** | `pokemon grades explained`, `pokemon card grading explained`, `pokemon card ratings`, `pokemon card rating`, `pokemon card rating system`, `rating pokemon cards`, `tcg card rating`, `pokemon cards grade`, `card grade pokemon` |
| **condition (raw) guide** | `pokemon card condition`, `pokemon card condition guide`, `pokemon cards condition guide`, `pokemon card condition grading`, `card condition pokemon`, `all pokemon card conditions`, `ex card condition` |
| **how-to / checker** | `how to check the grade on a pokemon card`, `how to tell the condition of a pokemon card`, `pokemon card condition checker`, `pokemon card grading criteria` |

`/guides/raw-vs-graded-pokemon-cards`: `graded vs ungraded pokemon cards`
(44), `raw vs graded` (54).
`/guides/how-pokemon-card-prices-work`: `how do pokemon cards get their
value` (38).
`/guides/vintage-vs-modern-pokemon-cards`: `what are vintage pokemon
cards` (57).

**Next-phase guide candidates (evidence-backed, DO NOT build yet):**
1. Strengthen `card-condition-grading` around the **grade-scale** cluster
   ("what is a grade 7/8/9", "grade X meaning", "grading scale explained")
   — the single densest real query cluster on the site.
2. A **"how to check / find a card's grade & condition"** how-to section
   or sibling guide (`how to check the grade…`, `…condition checker`,
   `how to tell the condition…`).
3. **PSA vs CGC vs BGS** comparison — adjacent to every grading query;
   not yet covered.

## Striking-distance card pages — shortlist for a later on-page phase (§12)

**[GSC]** `/cards/[slug]` pages at avg position **4–19** with **≥2
impressions**, 2026-08-20 → 09-08 (31 total; top 20, DO NOT mass-edit
titles):

| # | URL | impr | pos | real query (if not GSC-anonymised) |
|---|---|---:|---:|---|
| 1 | `/cards/houndoom-ex-full-art-xy-breakthrough` | 8 | 16.0 | `houndoom ex price` |
| 2 | `/cards/pikachu-ex-xy124-xy-promos` | 7 | 8.1 | `pikachu xy124` |
| 3 | `/cards/popplio-045-me-mega-evolution-promo` | 7 | 13.9 | (anonymised) |
| 4 | `/cards/moltres-12-fossil` | 5 | 7.2 | (anonymised) |
| 5 | `/cards/kangaskhan-5-jungle` | 5 | 10.2 | (anonymised) |
| 6 | `/cards/pikachu-v-full-art-swsh04-vivid-voltage` | 4 | 5.3 | (anonymised) |
| 7 | `/cards/glaceon-171-cosmos-holo-sv-scarlet-violet-promo-cards` | 4 | 10.0 | `glaceon 171 promo` |
| 8 | `/cards/excadrill-56-98-cosmos-holo-blister-exclusives` | 4 | 10.3 | (anonymised) |
| 9 | `/cards/ancient-mew-japanese-exclusive-print-miscellaneous-cards-products` | 4 | 12.0 | (anonymised) |
| 10 | `/cards/radiant-charizard-020-159-prize-pack-series-cards` | 3 | 4.0 | (anonymised) |
| 11 | `/cards/kakuna-base-set-shadowless` | 3 | 6.7 | (anonymised) |
| 12 | `/cards/umbreon-vmax-alternate-art-secret-swsh07-evolving-skies` | 3 | 7.7 | (anonymised) |
| 13 | `/cards/espeon-vmax-alternate-art-secret-swsh08-fusion-strike` | 3 | 8.7 | (anonymised) |
| 14 | `/cards/radiant-greninja-046-189-southeast-asia-exclusive-league-championship-cards` | 3 | 9.7 | (anonymised) |
| 15 | `/cards/popplio-sm03-general-mills-promo-miscellaneous-cards-products` | 3 | 18.7 | (anonymised) |
| 16 | `/cards/charizard-ex-power-keepers` | 2 | 6.5 | (anonymised) |
| 17 | `/cards/starmie-swsh09-brilliant-stars` | 2 | 8.5 | (anonymised) |
| 18 | `/cards/electrode-base-set-shadowless` | 2 | 9.0 | (anonymised) |
| 19 | `/cards/light-toxtricity-swsh137-swsh-sword-shield-promo-cards` | 2 | 9.0 | (anonymised) |
| 20 | `/cards/pikachu-227-s-p-swsh-sword-shield-promo-cards` | 2 | 9.0 | (anonymised) |

Ranking basis: impressions desc, then position asc. All carry a real
market-reference price + Product/Offer schema (verified in SEO-GSC-1 §8).
GSC anonymises the query for most rows (each has only 1–3 impressions).

## Performance (§13)

- `next build` — **compiled successfully**, no bundle regression (the two
  new components are server-only; `SetLinkIndex` and the expanded
  `CatalogueLinkIndex` emit class-less `<a>` so the RSC payload stays
  small).
- Homepage / `/pokemon` / `/sets` / detail pages: unchanged size (±1 KB).
- `/cards`: 189 KB → 282 KB (+93 KB for ~250 more links + A–Z headings) —
  comfortably inside the 400 KB `cards-directory.test.mjs` ceiling.
- The 4 grab-bag set pages grow (worst: WCD 1.15 MB, plain-text links, all
  below the fold, ISR-cached `revalidate: 900`). Accepted: 4 low-value
  URLs vs. putting 1,168 orphaned indexable cards on a crawl path.
  Googlebot's page limit is ~15 MB.

## Tests & build (§14)

- `npm run test:scanner` — **1381 / 1381 pass**.
- `npm run test:seo` — **343 / 343 pass** (12 new in
  `tests/seo/gsc2-crawl-hubs.test.mjs`: footer Browse row is
  server-rendered & unhidden; `/cards` SetLinkIndex fan-out; `/sets/[slug]`
  full text index & the INDEXABLE-only filter; robots/canonical/
  lastmod/indexability unchanged; P0.4.1 homepage preserved; live raw-HTML
  crawl-path + no-orphan-regression checks).
- `npm run build` — **✓ Compiled successfully.**

## Production verification (§15)

Verified against a local `next start` (Googlebot UA + ordinary client);
**re-verify on the deployed domain after merge:**

| URL | HTTP | raw HTML | canonical | robots | footer hub links |
|---|---|---|---|---|---|
| `/` | 200 | full | self | index | 5 ✓ |
| `/pokemon` | 200 | full, H1 "Browse Pokemon Cards by Generation", 1,025 species `<a>` | self | index | 5 ✓ |
| `/cards` | 200 | full, H1 "Pokemon Card Database & Prices", 208 set `<a>` + "Every set we track (208)" | self | index | 5 ✓ |
| `/sets` | 200 | full, 208 set `<a>` | self | index | 5 ✓ |
| `/guides` | 200 | full | self | index | 5 ✓ |
| `/sets/world-championship-decks` | 200 | full, "Full … card index (1587)" | self | index | 5 ✓ |

## Manual action required

**None new.** The SEO-GSC-1 recommendation stands and is still worth
doing: in GSC, submit `/sitemaps/cards.xml`, `/sitemaps/pokemon.xml`,
`/sitemaps/sets.xml` individually (per-family crawl reporting), and
optionally "Request indexing" once for `/pokemon` and `/cards` now that
they have a site-wide footer inlink.

## What this does NOT do

It does not make Google crawl faster — that is gated by domain age /
authority (SEO-GSC-1 P0). It gives the crawler, once it does come, a
complete stable path to every indexable page instead of a flat sitemap +
churny deal links. Re-baseline with `scripts/_gscAudit.mjs` in 4–6 weeks
(~mid-October 2026): expect `/pokemon` + `/cards` indexed, and the
"Discovered – currently not indexed" long-tail count falling.

---

# SEO-GSC-3 — grading / condition content cluster (implemented)

**Date:** 2026-09-07 · commit see §commit. Turns the existing
grading/condition search signal into a small hub-and-spoke cluster. No
change to robots, canonicals, sitemap architecture / `<lastmod>` /
segmentation, indexability gates, or any other page's SEO.

## Real GSC queries used (§1)

`/guides/card-condition-grading` baseline window 2026-08-01 → 09-09:
**0 clicks · 79 impressions · CTR 0% · avg position 64 · 25 distinct
queries** (29 impressions carry a query; the rest are GSC-anonymised).
The exact query set, grouped by intent:

| intent cluster | real GSC queries (verbatim) | destination |
|---|---|---|
| **Broad — condition + grading overview** | `pokemon grades explained`, `pokemon card grading explained`, `pokemon card condition grading`, `pokemon card condition`, `pokemon card condition guide`, `pokemon cards condition guide`, `all pokemon card conditions`, `card condition pokemon`, `ex card condition`, `what does it mean for a pokemon card to be graded` | **HUB** `card-condition-grading` (strengthened) |
| **Grade-number meaning / scale** | `what is a grade 7 pokemon card`, `grade 9 pokemon card meaning`, `what does grade mean in pokemon cards`, `pokemon card condition scale`, `pokemon card grading criteria`, `pokemon card ratings`, `pokemon card rating`, `pokemon card rating system`, `rating pokemon cards`, `tcg card rating`, `pokemon cards grade`, `card grade pokemon` | **SPOKE A** `pokemon-card-grading-scale` (new) |
| **How-to — inspect / check condition** | `how to check the grade on a pokemon card`, `how to tell the condition of a pokemon card`, `pokemon card condition checker` | **SPOKE B** `how-to-check-pokemon-card-condition` (new) |
| **PSA vs CGC vs BGS comparison** | *(none — no `psa vs cgc`, `cgc vs bgs`, `which grading company`, `best grading company` query in GSC)* | **NOT BUILT — merged into the hub** |

## Cannibalisation decisions (§9)

- **PSA vs CGC vs BGS comparison guide — REJECTED.** The doc listed it as
  candidate #3, but there is **zero query evidence** for a comparison
  ("which grader", "psa vs cgc", etc. — none in GSC). The hub already
  answers "what do PSA / CGC / BGS grades mean". A separate page would
  compete with the hub's grading-companies section on the same broad
  "grading explained" queries with no distinct intent to win. Instead the
  hub's existing company list got a one-paragraph bridge to Spoke A for
  the number breakdown. Net new guides this phase: **2, not 3.**
- **Spoke A vs Hub:** hub keeps PRIMARY = broad "pokemon card condition /
  grading explained"; A takes PRIMARY = number-specific "what is a grade
  X / grading scale / grading criteria / card ratings". Distinct
  title / H1 / meta (test 5 locks no title collision).
- **Spoke B vs Hub vs raw-vs-graded:** B is strictly the hands-on
  inspection task. It does **not** answer "should I grade" (that stays on
  `raw-vs-graded-pokemon-cards`) or "what does grade 8 mean" (Spoke A).
- **`pokemon card ratings` / `rating system`** (were on the hub at
  pos ~76): re-homed to Spoke A, which states up front that "rating" and
  "grade" are the same thing colloquially.

## Pages created / updated (§2, §3, §4)

| page | status | title | H1 | primary intent |
|---|---|---|---|---|
| `/guides/card-condition-grading` | **updated** (not rewritten) | Pokemon Card Condition & Grading Explained | Pokemon Card Condition & Grading Explained | broad condition + grading hub |
| `/guides/pokemon-card-grading-scale` | **new** | The Pokemon Card Grading Scale, 1 to 10 | The Pokemon Card Grading Scale, 1 to 10 | what a grade number means |
| `/guides/how-to-check-pokemon-card-condition` | **new** | How to Check a Pokemon Card's Condition | How to Check a Pokemon Card's Condition | inspect a card by hand |

**Hub changes (additive only):** two bridge paragraphs after the grading-
companies list (→ Spoke A for the number breakdown, → Spoke B for
inspection); both spokes added to "Keep reading" ahead of the existing
links. Everything already there — the raw NM→DMG scale, the
`<ConditionScale>` figure, the PSA/CGC/BGS/SGC/ACE/TAG list, the FAQ +
FAQPage schema, `/methodology` link — is untouched.

**New deterministic components** (existing design system, mobile-safe,
`overflow-x-auto` on the tables):
- `components/guides/GradeScaleTable.js` — a 10→1 table (grade · common
  name · "roughly what it communicates"). General hobby vocabulary
  (Gem Mint / Mint / Excellent / …), **no per-company tolerances, no
  population data.**
- `components/guides/ConditionAxes.js` — centering / corners / edges /
  surface / creases: what to look at, how, and what costs points. Shared
  by both spokes.

## Content quality (§5, §12)

- No AI filler, no padded intros, no word-count target — each page is
  structured + scannable (tables + short sections).
- **Grading-claim safety:** every certainty is hedged. Spoke A: "Treat
  this as *roughly what the number communicates*, not a checklist that
  produces a guaranteed result" and a dedicated "The grading company
  makes the final call" section. Spoke B: "It will not tell you the
  grade" up front, "A thorough check tells you what is likely, not what
  will happen", "The grader still decides". No "this card will get a
  PSA 10" phrasing anywhere; no fabricated population reports or
  company standards (tests 3 + 4 lock this).
- No clickbait ("Ultimate", "Secret", "Guaranteed", "Everything You Need
  to Know") in any title or body.

## Internal-link cluster (§7)

```
        card-condition-grading  (hub)
          ▲   │        │   ▲
          │   ▼        ▼   │
  grading-scale ◄────► how-to-check-condition   (spokes, cross-linked)
          │                │
          └──► raw-vs-graded, how-prices-work, /methodology,
               /deals/graded, /pokemon, /cards
```

Verified in raw HTML: hub → both spokes; each spoke → hub + sibling spoke
+ `raw-vs-graded`; each spoke → `/methodology` and at least one of
`/deals/graded` · `/pokemon` · `/cards`. No sitewide/boilerplate link
injection. Guides remain informational — **0 affiliate hooks** on the new
pages (test 7).

## Structured data (§11)

- `GuideLayout` already emits `BreadcrumbList` + `Article`. New guides
  carry a truthful **per-guide `published` date (2026-09-07)** — added a
  `published` field to `lib/guides.js` and `GuideLayout` now reads
  `g.published ?? GUIDES_PUBLISHED`, so a new guide's Article
  `datePublished` / `dateModified` is its real date, never the
  original-batch default and never a build time.
- Each spoke has a visible FAQ restated from its own body, with matching
  `FAQPage` JSON-LD — same pattern as the hub. Added because the Q&A is
  genuinely on the page, not to chase a rich result.

## GSC baseline (§13)

| page | window | clicks | impr | CTR | avg pos | queries |
|---|---|---:|---:|---:|---:|---:|
| `/guides/card-condition-grading` | 2026-08-01 → 09-09 | **0** | **79** | **0%** | **64** | 25 |
| `/guides/pokemon-card-grading-scale` | — | 0 | 0 | — | — | 0 (created 2026-09-07) |
| `/guides/how-to-check-pokemon-card-condition` | — | 0 | 0 | — | — | 0 (created 2026-09-07) |

**Measurement window:** compare a 28-day window ending **~2026-11-05**
(≈4 weeks after this deploy plus GSC's ~3-day lag) against the pre-change
baseline above. Expect movement in *impressions / average position* for
the grade-number and how-to queries before any clicks — the domain is
still new (SEO-GSC-1 P0).

## Indexability / crawl (§14)

Both new guides: server-render full content (81 KB / 76 KB raw HTML,
tables + headings present pre-hydration), self-canonical, no robots meta,
listed automatically on `/guides` (index maps `GUIDES`) and in the
`pages` sitemap segment (`lib/sitemap.js` maps `GUIDES`), reachable from
the hub + the sibling spoke + the footer "Browse → Buying Guides" link
(SEO-GSC-2). Not orphaned. **No manual GSC indexing requests.**

## Tests & build (§15)

- `npm run test:scanner` — **1381 / 1381**.
- `npm run test:seo` — **357 / 357** (12 new in
  `tests/seo/gsc3-grading-cluster.test.mjs` + the 2 new slugs added to
  `pages.test.mjs`): two guides only / rejected-comparison not created;
  truthful per-guide publish date, no `Date.now()`; no fabricated year or
  clickbait; grading-claim hedging + no population data; distinct
  titles/H1; hub↔spoke↔spoke links; informational (no affiliate hooks);
  200 / self-canonical / indexable / server-rendered; table content in
  raw HTML; `/guides` + sitemap inclusion; hub original content preserved.
- `npm run build` — **✓ Compiled successfully** (both guides prerendered
  static).

## Production verification (§16)

Verified against a local `next start` (Googlebot UA + client) —
**re-verify on the deployed domain after merge:** both new guides 200,
full raw HTML, correct self-canonical, no noindex, hub/spoke links
resolve, tables scroll rather than overflow on narrow viewports, no
hydration mismatch. Hub unchanged except the two new outbound links.
