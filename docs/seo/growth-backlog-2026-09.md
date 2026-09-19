# SEO → affiliate growth: diagnosis, backlog and progress record

Durable record for the autonomous growth assignment (started 2026-09-20).
Resume from here; do not restart the audit. Companion records:
`docs/growth-upgrade-2026-09.md` (the 19 Sep brief and GEO audit),
`docs/gsc-indexation-audit.md`, `docs/seo/gsc-weekly-2026-09-15.md`,
`docs/pitch-pack.md`, `docs/distribution-kit.md`.

## Diagnosis (evidence, 2026-09-20)

| Bottleneck | Verdict | Evidence (source, date) |
|---|---|---|
| Authority | **Primary ceiling** | Backlink audit: no referring signals; GSC 05–19 Sep: 0 brand queries; value queries at pos 40–78 |
| Crawling / discovery | Real, acted on | GSC Page indexing (UI, 20 Sep): 24,952 "Discovered – currently not indexed", 1,813 indexed, 238 canonical-alt, 30 noindex. Sitemaps advertised ~13.9k URLs. |
| Indexation | Fine where crawled | URL Inspection (API, 20 Sep): home, card, set, species, guide, category all "Submitted and indexed" |
| Intent alignment | Fine | Titles/descriptions trimmed 20 Sep; identity-first templates |
| Content usefulness | Gap on value intent | ~70 % of keyed queries are card value/identity; card pages answer raw + graded worth (19 Sep); species "all X cards" intent unaddressed (experiment hold) |
| CTR | Not yet measurable | Titles changed 20 Sep; read GSC 2026-10-04 |
| Engagement → affiliate | **Gap on guides and set pages** | PostHog 23 Aug–19 Sep: page views home 490 / set 304 / hub 277 / category 261 / guide 218 / deal 115 / card 102; affiliate clicks by origin: category 121, deal 137, home lanes 89, card hub 15, set 13, **guides 0** |

Traffic scale (all sources, PostHog cookieless): ~1,960 page views / 28 days;
GSC 05–19 Sep: 13 clicks, 820 impressions. Every rate below is on small
samples; treat as directional.

## Ordered backlog

| # | Opportunity | Template / URLs | Why | Impact · confidence | Effort · cost | Status |
|---|---|---|---|---|---|---|
| 1 | Live-offers module on set-bound guides | 9 × 30th Celebration guides (61 % of organic clicks, 0 affiliate clicks) | Readers of a set guide are the readers most likely to want that set's offers; set page was one unmarked click away | Medium · high (same data as set page) | Low · none | **Shipped 2026-09-20** (batch 1) |
| 2 | Stop advertising `cards-bulk` in the sitemap index | 6,051 lowest-value card URLs | Crawl goes to sets / Pokémon / guides / priced cards first | Medium · medium | Low · none | **Shipped 2026-09-20** (`b2f3272`); measure 2026-10-04 |
| 3 | Titles/descriptions to SERP length; LCP hints; sitemap lastmod; pagination nofollow | site-wide statics, card/set templates | CTR at pos 7–15; crawl focus | Medium · medium | Low | **Shipped** (`9d99d4a`) |
| 4 | Delta Reign pre-launch cluster | 3 guides | Next-release demand; the family that converts to clicks | Medium · high (pattern proven by 30th cluster) | Low | **Shipped** (`f6bd9b4`) |
| 5 | Outreach pitch pack | `docs/pitch-pack.md` | The authority ceiling | High · unknown until sent | Owner sends | **Prepared** (send authorization not in scope) |
| 6 | Price-movers asset from `price_history` | new `/market-data/price-movers` | Linkable, evergreen-refreshing, real intent ("cards going up in value") | High · medium | Medium · low | **DEFERRED to ≥ 2026-10-11**: provenance-verified observations only exist from 2026-09-11 (probe 20 Sep: 0 verified rows on 2026-08-20); 30-day comparisons cannot be supported on comparable samples before then |
| 7 | "Every X card" intros on `/pokemon/[slug]` | 900+ species pages | Set/list intent at pos 64–80 | Medium · medium | Low | **DEFERRED**: species indexation experiment window to 2026-10-28 / 11-11 (do not change cohorts) |
| 8 | Set-page → offers conversion (304 views, 13 clicks) | `/sets/[slug]` | Largest content family by views | Low–medium · low (most set views are catalogue-only sets with no live offers) | Low | Watch; revisit with batch-1 data |
| 9 | `cards-low` shard (3,122 URLs) | sitemap index | Same logic as #2 | Low–medium · low | Low | Wait for #2 measurement |
| 10 | Competitive SERP sampling | 3 target intents | Gap identification | Medium · medium | Medium | **Done 2026-09-20** → produced batch 2; set template already competitive; deal SERP = clones |
| 11 | "Other printings of this card" on card pages | `/cards/[slug]` (every card with a sibling printing) | Card-value SERPs lead with the variant breakdown | Medium · medium | Low · none | **Shipped 2026-09-20** (batch 2) |

## Safeguards honoured
Scanner budgets, verify pipeline, quotas: untouched. Social automation:
paused (all four platforms). Outreach: drafts only. Species experiment
cohorts: untouched. No provider calls added to any render path.

## Baseline test failures
Ratchet: 36 failing / 36 quarantined (pre-existing, unchanged through every batch).

## Batches

### Batch 1 — 2026-09-20 — guide live-offers module
- Finding: guides = most organic clicks, zero affiliate clicks (PostHog 28 d).
- Action: `lib/guides.guideOffersSet` (explicit mapping, 30th cluster), `components/guides/GuideLiveOffers` (≤3 Buy It Now listings with a supported saving, same data as the set page, renders nothing when empty), one render site in `GuideLayout`; `tests/scanner/guide-live-offers.test.mjs`.
- Measurement: PostHog `affiliate_click` with `origin_section = "guide_offers"` and `page_type = "guide"`; compare guide page views → clicks from 2026-09-20 against the 0/218 baseline. Read 2026-10-04.

- Commit `e804995`; production verified 2026-09-20: module present on `/guides/pokemon-30th-celebration-guide` and the Pikachu checklist guide (4 deal cards rendered, 2 sponsored eBay affiliate links with EPN params, origin `guide_offers`, Article schema intact); absent on `/guides/how-pokemon-card-prices-work` and the Delta Reign guides (200, no module).
- STATUS: IMPROVED. Business impact: pending measurement (2026-10-04).

### Batch 2 — 2026-09-20 — "other printings of this card" on card pages
- Finding: SERP sample (20 Sep, "charizard base set card value"): the ranking pages (PriceCharting, PokeScope, CGC) lead with a printing breakdown (Unlimited / Shadowless / 1st Edition, a figure each). Our card pages are one printing per page and the sibling printing sat unlabelled inside the same-Pokemon list.
- Action: `lib/cardPrintings.otherPrintings` — a strict rule (same collector number, same set family after stripping the printing qualifier; "Base Set 2" excluded) over the relations the page already loads; rendered first in `RelatedCards` as "Other printings of this card" with each printing's catalogue reference (written "USD", no "$", so the worth answer stays the page's one "$" reference); the card page passes it with no extra query. `tests/scanner/card-printings.test.mjs`.
- Other SERP findings, same sample: set price-list queries — our set template already matches the winning shape (card count, top-value list, checklist); deal queries — the top organic results are direct clones of our positioning (`pokedealfinder.uk`, Pallet, Jimmy's Deal Finder, CardVex), which is a brand-adjacency matter for the owner, not a code task. Sample: 3 queries, US results, 2026-09-20.
- Measurement: GSC pages `/cards/charizard-base-set` and `/cards/charizard-base-set-shadowless` (impressions/position for "charizard base set" queries) from 2026-09-20; read 2026-10-04.

- Commit `63e7942`; production verified 2026-09-20 on `/cards/charizard-base-set`: one printing listed (Shadowless), Base Set 2 not listed. `/cards/charizard-base-set-shadowless` re-check pending its ISR window.
- STATUS: IMPROVED. Business impact: pending measurement (2026-10-04).

### Batch 3 — 2026-09-20 — no-deal card pages: the eBay search becomes a real control
- Finding: card pages are the largest search-landing family (102 views / 15 affiliate clicks, 28 d). Most render the catalogue path (no live hub), whose only route to eBay was a text link inside CardNextSteps (origin `card_catalog`: 9 clicks).
- Action: the link is a 48 px ghost control — deliberately not the primary lime treatment, because browsing all listings is not a verified deal — with the same text, same event (`card_no_deal` / `search_ebay`) and the "not checked against market price" caveat kept beside it. Pinned in `card-printings.test.mjs`.
- Measurement: Vercel Analytics event `eBay Click` with placement `card_no_deal`, and PostHog `affiliate_click` origin `card_catalog`, from 2026-09-20 vs the 9-click baseline.

## Measurement calendar
- **2026-10-04**: GSC CTR on retitled pages; Delta Reign guide impressions; Page indexing "Discovered – not indexed" after the bulk-shard change; PostHog guide_offers clicks.
- **2026-10-11**: price_history provenance depth → decide #6.
- **2026-10-28**: species experiment 6-week review → decide #7.

## Blockers
- Search Console API token is read-only (no sitemap resubmission / no indexing API); UI actions done by hand when authorised.
- PageSpeed Insights anonymous quota exhausted 19 Sep; CrUX has no field data (traffic too low).
