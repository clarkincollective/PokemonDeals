# SEO → affiliate growth: diagnosis, backlog and progress record

Durable record for the autonomous growth assignment (started 2026-09-20).
Resume from here; do not restart the audit. Companion records:
`docs/growth-upgrade-2026-09.md` (the 19 Sep brief and GEO audit),
`docs/gsc-indexation-audit.md`, `docs/seo/gsc-weekly-2026-09-15.md`,
`docs/pitch-pack.md`, `docs/distribution-kit.md`.

## Diagnosis (evidence, 2026-09-20)

| Bottleneck | Verdict | Evidence (source, date) |
|---|---|---|
| Authority | **Confirmed as the binding constraint (2026-09-21), now measured.** Referring domains: **3, all worthless** — see the DataForSEO section below. | Previously UNKNOWN. What the earlier "zero referring domains" rested on: `docs/authority-backlink-audit.md` (2026-09-07) — no backlink tool or API was available, so the figure is an **exact-domain web search that found 0 pages mentioning `pokemondealfinder.com`**, plus the absence of a GSC Links report at the time. Not a crawl of the link graph. Re-checked 2026-09-20: the GSC Links report (UI, URL-prefix property) shows "Processing data, please check again in a day or so" — no referring-site count is readable yet. Supporting signals: GSC 05–19 Sep 0 brand queries; value queries at avg position 40–78. What would establish it: the Links report once it populates; a ranking change on pages whose content did not change after a link is earned. Until then, treat authority as one of several levers (below), not the only one. |
| Crawling / discovery | Two different facts, kept apart | **Crawl activity is real and substantial** — GSC Crawl stats (UI, 26 Aug–16 Sep 2026): 89.3k crawl requests, 100 % responded 200 (404/5xx/301 each < 1 %), average response 601 ms, host status "no problems in 90 days"; by purpose 92 % refresh / 8 % discovery; by file type "other" 76 %, HTML 17 %, JS 3 %, JSON 2 %. Submitted child sitemaps were last downloaded 18–19 Sep 2026 (API `sitemaps.list`, read 20 Sep: seven on 19 Sep; `cards-bulk` and `cards-low` on 18 Sep). **"Discovered – currently not indexed" (24,952, Page indexing UI, 20 Sep) is a selection outcome**: URLs Google knows from the sitemaps but has not chosen to fetch or index, against 1,813 indexed, 238 canonical-alternates, 30 noindex. The two are not the same thing: the site is crawled ~1k requests/day, mostly refreshes of what is already known; the discovery share is small. Acted on: `cards-bulk` (6,051 URLs) left out of the sitemap index (`b2f3272`, deployed 2026-09-19 ~22:06 UTC). Caveat found 20 Sep: `/sitemaps/cards-bulk.xml` is still a **directly submitted** sitemap in Search Console (submitted 15 Sep), so Google will keep fetching it until the owner removes that submission in the UI (read-only token cannot). |
| Indexation | Fine where crawled | URL Inspection (API, 20 Sep): home, card, set, species, guide, category all "Submitted and indexed" |
| Intent alignment | Fine | Titles/descriptions trimmed 20 Sep; identity-first templates |
| Content usefulness | Gap on value intent | ~70 % of keyed queries are card value/identity; card pages answer raw + graded worth (19 Sep); species "all X cards" intent unaddressed (experiment hold) |
| CTR | Not yet measurable | Titles changed 20 Sep; read GSC 2026-10-04 |
| Engagement → affiliate | **Gap on guides and set pages** | PostHog 23 Aug–19 Sep: page views home 490 / set 304 / hub 277 / category 261 / guide 218 / deal 115 / card 102; affiliate clicks by origin: category 121, deal 137, home lanes 89, card hub 15, set 13, **guides 0** |

Traffic scale (all sources, PostHog cookieless): ~1,960 page views / 28 days;
GSC 05–19 Sep: 13 clicks, 820 impressions. Every rate below is on small
samples; treat as directional.

**Levers, not one lever (2026-09-20 correction).** An earlier report said
outreach was "the only lever on the primary ceiling". That overstated it.
The open levers, each with its own evidence path:
1. Authority — owner sends from `docs/pitch-pack.md` (drafts only; no automation).
2. Content usefulness on value intent — card-page answers (shipped), printings (shipped), species "every X card" intros (held to 2026-10-28 by the experiment).
3. On-site conversion — guide live offers, printings, the no-deal control (shipped; measured from 2026-10-04, earlier if events arrive).
4. Crawl focus — bulk shard unadvertised (shipped); the direct sitemap submission still to be removed (owner, UI); `cards-low` pending measurement.
5. Search-result CTR — retitles (shipped `9d99d4a`); read 2026-10-04.
6. Editorial usefulness — card art on every guide (batch 4).

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
| 8 | Set-page → offers conversion (304 views, 13 clicks) | `/sets/[slug]` | Largest content family by views | Low · low | Low | **Watch, not build** (2026-09-20): 234 of the 304 set views (77 %) are `/sets/me-30th-celebration`, reached by checklist-intent readers from the Pikachu checklist guide; that page already puts its live-offer section first. The rate reflects the audience, not the layout. 83 of 210 set pages are deal-backed; 127 are catalogue-only. Revisit if batch 1's guide module moves guide→offer clicks. |
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

- Commit `63e7942`; production verified 2026-09-20 on `/cards/charizard-base-set`: one printing listed (Shadowless), Base Set 2 not listed.
- Follow-up (same day): `/cards/charizard-base-set-shadowless` stayed empty after its ISR window. Cause: the catalogue render (`CatalogCardView`, the path most card pages take when there is no live-deal hub) never passed `printings` to `RelatedCards`; only the live-hub path did. Fixed by passing the same rule over the same relations on that path (no extra query); pinned in `card-printings.test.mjs`. Commit `e179425`; production verified 2026-09-20: `/cards/charizard-base-set-shadowless` lists one printing (Base Set, reference written "USD", no "$" in the block); `/cards/charizard-base-set` unchanged (Shadowless).
- STATUS: IMPROVED. Business impact: pending measurement (2026-10-04).

### Batch 3 — 2026-09-20 — no-deal card pages: the eBay search becomes a real control
- Finding: card pages are the largest search-landing family (102 views / 15 affiliate clicks, 28 d). Most render the catalogue path (no live hub), whose only route to eBay was a text link inside CardNextSteps (origin `card_catalog`: 9 clicks).
- Action: the link is a 48 px ghost control — deliberately not the primary lime treatment, because browsing all listings is not a verified deal — with the same text, same event (`card_no_deal` / `search_ebay`) and the "not checked against market price" caveat kept beside it. Pinned in `card-printings.test.mjs`.
- Measurement: Vercel Analytics event `eBay Click` with placement `card_no_deal`, and PostHog `affiliate_click` origin `card_catalog`, from 2026-09-20 vs the 9-click baseline.
- **Correction (2026-09-20, event audit):** the PostHog origin `card_catalog` is emitted by the **"Check on TCGPlayer"** `AffiliateLink` on the catalogue render (`CatalogCardView`), not by the eBay search control. Rows before 2026-09-19 carry no `network` property and the growth report defaults them to "ebay", so the "9 clicks" baseline was TCGplayer clicks reported under eBay. The eBay search control (`EbaySearchLink`) emits **only** the Vercel Analytics event `eBay Click` `{ placement: "card_no_deal", cta: "search_ebay", marketplace }` — that is the measure for batch 3, and it has no PostHog counterpart by existing design. No new emission was added (the assignment forbids duplicate tracking); the growth report cannot see this control and the record now says so.

- Commit `74e38db`; production verified 2026-09-20 on three catalogue-path card pages (`/cards/yveltal-ex-053-088-prize-pack-series-cards`, `/cards/imposter-oak-s-revenge-team-rocket`, `/cards/grookey-swsh070-swsh-sword-shield-promo-cards`): no-deal block present, ghost control present, caveat present, one sponsored eBay search link, no primary (lime) treatment on it.
- STATUS: IMPROVED. Business impact: pending measurement (2026-10-04).

### Event verification — 2026-09-20 (read ~01:00 UTC, PostHog HogQL, read-only)
Window: from the batch 1 deploy (2026-09-19 21:30 UTC) to the read. Sizes are tiny; this is a wiring check, not a result.
- `affiliate_click` events in the window: **0** (any origin, any network). So `guide_offers` has not fired yet — nothing to inspect for property shape until a visitor clicks. The component passes `origin_section: "guide_offers"` and `AffiliateLink` adds `page_type` from the path (`guide`), `placement`, `network`; the same code path already produced well-formed rows for other grids.
- Exposure: `page_view` with `page_type = guide`: 8 in the window, of which **3 on module-bearing guides** (Pikachu checklist 1, Mew & Mewtwo 1, promo cards 1); the module renders only when the set has qualifying offers, so exposure ≤ 3. `page_view` on card pages: 2 (2 distinct paths). No click was expected from that many views.
- Duplicate firing: `affiliate_click` grouped by `distinct_id` + second, 2026-09-01 → read: **0 groups with more than one event**. `AffiliateLink` fires one Vercel `track` and one PostHog `capture` per click (two systems, one event each) — not a duplicate within either system.
- Controlled vs genuine: no verification clicks were made during this assignment (affiliate test clicks are prohibited), so every click that arrives is a visitor's. The reporting helper already flags `SUSPECTED_TEST_TRAFFIC` days; none are in this window.
- Vercel `eBay Click` (batch 3's measure): **not readable from this session** — the Vercel MCP analytics tool returned "not found" twice and the dashboard domain is not permitted in the browser session. Owner can read it at Vercel → Analytics → Events, filter `placement = card_no_deal`.
- Read again 2026-10-04 (planned comparison date; events may show earlier and will be read when they do).

### Batch 4 — 2026-09-20 — card art on every guide
- Finding (owner request, 20 Sep: "make sure all our articles have card image references"): production audit of all 29 guides — 7 rendered zero images: the three Delta Reign guides, the eBay buyer's checklist, how to read a listing, vintage cards worth buying, booster box prices. All 3 news stories carry images.
- Action: `Gallery` figures from `components/guides/CardArt` (catalogue scans of verified `GUIDE_CARDS`, each tile linking its own card page) added to six of the seven: Delta Reign release guide (the four named Pokemon as cards that exist today — three new verified registry entries: Golurk Black Bolt 123/086, Malamar EX Phantom Forces 115/119, Golisopod ex Paradox Rift 246/182), Storm Emeralda vs Delta Reign (two English Rayquaza printings), preorders & prerelease (XY Evolutions Charizard and its prerelease-stamped copy), eBay checklist (Arcanine Unlimited vs Shadowless), read-a-listing (the Umbreon VMAX trio), vintage worth buying (the three WOTC Charizards). Every caption says what the image is and is not.
- **Leaked or third-party images are not used.** The owner suggested leak images "from wherever"; this batch does not do that, because the site cannot verify a leaked photograph, it would be republishing someone else's photograph without permission, and the assignment's source-permission rule applies. Unreleased-set coverage stays text plus a credited link to the outlet that published the image. If the owner wants official pre-release art, the route is The Pokemon Company's own press/gallery pages with attribution — a decision for the owner, not taken here.
- Commit `43841fa`; production verified 2026-09-20 (deployment `dpl_4gi11cYdQGCgu1Yzh2ayJ1osADV7`): Delta Reign release guide 4 images / 4 card links, Storm Emeralda 2 / 2, preorders 2 / 2, eBay checklist 2 / 2, read-a-listing 3 / 3, vintage 3 images; each in one `<figure>` with its caption. STATUS: IMPROVED. Business impact: not measurable separately (editorial quality); guide engagement read with the 2026-10-04 set.
- `pokemon-booster-box-prices`: completed in batch 6 (product photos, below).

### Batch 5 — 2026-09-20 — Shadowless valuation answer: chart legend
- Finding: the three dollar figures on `/cards/charizard-base-set-shadowless` are the price-history chart's y-axis ticks — min $1,163.60, synthetic midpoint $1,710.73, max $2,257.87 — over one USD series for one product (TCGplayer 106999), plus the same max as the endpoint label. The worth answer states one figure ($2,258, raw, Lightly Played, 1st Edition excluded). Stored series (price_history, read 20 Sep): 13 readings 30 Aug–11 Sep with no recorded condition/printing ($2,146 → $1,163.60), one verified reading 12 Sep at $1,163.60 for **Moderately Played, Unlimited Holofoil**, then Lightly Played, Unlimited Holofoil at $2,257.87 from 13 Sep. All figures are supported by their own rows. Two ambiguities were real: (1) the legend said "13 earlier readings didn't record which condition and printing they were for (or were for a different reference)" — there were 14 dashed points and one of them was a verified, different reference; (2) "Unlimited Holofoil" on a page titled "Base Set (Shadowless)" reads as "the Unlimited set" to a collector, when it is the provider's label for the not-1st-Edition printing.
- Action: `lib/priceHistoryLegend.js` (pure) splits the dashed points into "no provenance recorded" and "a different reference (named)"; the legend renders both counts and, when the printing label starts with "Unlimited", adds "'Unlimited' is the printing that is not 1st Edition." Axis ticks unchanged (they are scale, not claims). `tests/scanner/price-history-legend.test.mjs`.
- Commit `43841fa`; production verified 2026-09-20 on `/cards/charizard-base-set-shadowless`: legend attributes dashed=14, unrecorded=13, other-reference=1; text reads "Verified Lightly Played, Unlimited Holofoil reference since Sep 13. 'Unlimited' is the printing that is not 1st Edition. 14 earlier readings are shown dashed, not comparable: 13 didn't record which condition and printing they were for, and 1 was for a different reference (Moderately Played, Unlimited Holofoil)." STATUS: IMPROVED.

### Batch 6 — 2026-09-20 — bulk sitemap resolved; eBay control measured in PostHog; booster-box product art
Commit `797d9cb`; production verified 2026-09-20 (~23:55 UTC 19 Sep).

**1. `cards-bulk` sitemap — actual behaviour and correction.**
- Original rationale (`b2f3272`, 19 Sep): steer crawl to higher-value pages by dropping the shard from the index; pages untouched. Inspection 20 Sep: `https://pokemondealfinder.com/sitemaps/cards-bulk.xml` still returned 200 with 6,050 URLs (1.09 MB), every one passing the substance gate; robots.txt references only `/sitemap.xml`; the index omitted the shard; Search Console still held a **direct** submission of the shard (15 Sep, last downloaded 18 Sep 21:26 UTC). Two of the site's own rules were being broken by the unadvertised state: "an indexed hub must be in a sitemap at all times" (6 live-deal hubs were in bulk) and "article-linked cards are advertised" (41 guide-linked cards were in bulk).
- Decision: not retired. The endpoint now serves only the URLs the lowest band has a reason to advertise — live-deal hubs and article-linked cards (`lib/cardSitemap.selectBulkShardCards`) — and the index lists it again. A sub-$5 card whose only signal is a proven price change is no longer advertised anywhere; it keeps its URL, canonical, indexability and internal links (no deletion, no noindex; sitemap-parity subset invariant holds). `UNADVERTISED_SEGMENTS` stays as the mechanism, empty.
- Production now: `/sitemap.xml` lists nine children including `cards-bulk`; `/sitemaps/cards-bulk.xml` → 200, 8,305 bytes, **45 URLs** (6 hubs + 39 guide-linked cards; comment: `bulk-rule on (live-deal hubs and article-linked cards only: 45 listed, 6005 sub-$5 lastmod-only cards not listed)`); `cards-low` unchanged at 3,124. Total advertised card URLs 5,248 of 23,810 eligible.
- Remaining Search Console cleanup: **optional**. The direct submission is now consistent with the index (same 45 URLs). Removing it would only tidy the Sitemaps list; Google will keep the 45 URLs from the index either way. Nothing is required.

**2. eBay catalogue-button measurement.**
- Trace: `components/EbaySearchLink.js` fired only Vercel `track("eBay Click", { placement, cta, marketplace })`; `components/AffiliateLink.js` is the only place PostHog `affiliate_click` was emitted (via `lib/analytics/client.capture`, allowlisted in `lib/analytics/events`). The growth report reads PostHog only, so the no-deal card page's only route to eBay was invisible to it.
- Change: `EbaySearchLink` now also calls `capture(EVENTS.AFFILIATE_CLICK, { origin_section, placement, page_type, network: "ebay", country })` — placement/origin from the caller's `event.placement` (`card_no_deal` on card pages), `page_type` from the path, `country` from the chosen marketplace (undefined when none is chosen). One Vercel event and one PostHog event per click; the Vercel event and the affiliate `href` are unchanged; each call is wrapped so analytics can never block the click. No new analytics system.
- Code verification: `tests/scanner/ebay-search-link-events.test.mjs` compiles the component with the analytics modules stubbed, invokes the rendered anchor's `onClick`, and asserts exactly one `track` + one `capture` per click with the payload above, the href untouched, and that throwing stubs do not break the handler.
- Emission verification (production, 19 Sep 23:58 UTC): on `/cards/imposter-oak-s-revenge-team-rocket` the control was clicked by script with `preventDefault` installed in the capture phase, so the page did not navigate and no eBay tab opened (no affiliate redirect followed, no purchase). The tab's network log then showed `POST https://eu.i.posthog.com/i/v0/e/` → 200. The Vercel `_vercel/insights` request was not observed in the tab log (its code path is unchanged; the Vercel event remains outside this session's read access).
- Receipt verification (PostHog HogQL, read ~00:02 UTC): two `affiliate_click` rows, both `placement=card_no_deal`, `origin_section=card_no_deal`, `page_type=card`, `network=ebay`, `country=null` (no marketplace chosen in the test browser), path as above. **Both are verification events, not visitors:** 23:57:46 UTC (carries `utm_source=pdf_verification` from a first attempt whose page was loaded with that marker) and 23:58:47 UTC (unmarked; identified by this timestamp and path).
- Exclusion: `npm run report:growth` now excludes `utm_source = pdf_verification` from every query (`VERIFICATION_UTM_SOURCE`). The unmarked 23:58:47 event cannot be excluded by property; any read of `card_no_deal` clicks on 2026-09-19 UTC must subtract exactly one event. Real visitor activity for this placement before this batch: zero PostHog rows existed (the event did not exist); Vercel `eBay Click` remains the historical series.

**3. Booster-box guide artwork.**
- Source: the TCGplayer product CDN (`tcgplayer-cdn.tcgplayer.com/product/<id>_in_1000x1000.jpg`), the same source and the same on-site usage as the catalogue card scans and the sealed deal cards (`components/SealedDealCard.js`, `docs/social-card-artwork.md`). No third-party photograph. Not a new licence position; the existing one extended to a guide figure.
- Identities (verified in `sealed_catalog` 2026-09-20; each image URL returned 200 `image/jpeg`): Evolving Skies Booster Box (SWSH07, product 242436, 36 packs), Ascended Heroes Booster Bundle (ME, 668541, 6 packs), Ascended Heroes Booster Pack (ME, 672434, 1 pack) — the three pack counts the guide compares. Registry `GUIDE_PRODUCTS` in `lib/guideLinks.js`, pinned in `guide-card-links.test.mjs`; tiles link `/sealed-deals` (no per-product page exists).
- Component: `ProductTile` / `ProductGallery` in `components/guides/CardArt.js` — square reserved box, `alt="<label> — <type>, product photo"`, caption states these are catalogue product photos, not a seller's item or a statement about seal, contents or price.
- Production: `data-product-gallery="3"`, three `<img>` with the expected alts and CDN sources. Mobile check (390 px frame): two tiles per row plus one centred, each 132 × 132 px, gallery 323 px wide, document scroll width 371 px < viewport 387 px (no horizontal scroll); screenshot reviewed.

### Batch 7 — 2026-09-20 — homepage answers first (AI citability)
- Finding: AI-citability audit of the homepage (page fetched live; six US SERPs via Firecrawl search; competitor pages via Firecrawl scrape). Score 58/100: the quotable answer existed (the dated capsule) but sat in 13 px type under a slogan H1; no comparison content; no byline; the site appeared in no US top 10 for "pokemon card deals", "pokemon cards below market price", "best site to find cheap pokemon cards", "how to find underpriced pokemon cards on ebay", "is pokemon deal finder legit" or "pokemon card price checker". Reddit threads, YouTube and Facebook groups win the deal intents; TCGplayer and PriceCharting the price-check intent. Volume / difficulty / CPC remain estimates until DataForSEO is verified (owner action, see below).
- Action (`2477840`): H1 "Pokemon card deals below market price on eBay"; capsule at body size; `components/HomeHowItCompares` — five question-form H2s that open with the answer, five key takeaways, a dated five-row comparison table (each third-party tool described from its own page), a byline linking /about with a review date; Article JSON-LD dated by that review constant; FAQ reshaped to eight questions of 2–4 sentences with graded cards and the no-saving state added. `tests/scanner/home-geo-2026-09-20.test.mjs`.
- Not done (owner): the off-page action — a first-person post in one Reddit buying-guide thread following that subreddit's rules, and the PokeBeach pitch from `docs/pitch-pack.md`. AI engines cite what Reddit, YouTube and PokeBeach cite; on-page work alone does not put the domain in their evidence set. Publication stays under the owner's hold.
- Dashboard: https://claude.ai/artifact/BetRWH5H3yfC4W3HHmURCX
- Production verified 2026-09-20 after `2477840`: H1 "Pokemon card deals below market price on eBay"; capsule at `text-sm`; the block renders five question-form H2s, five takeaways, the comparison table and the byline; Article JSON-LD with `dateModified` 2026-09-20 and the site entity as author; FAQPage and the visible FAQ both carry eight questions. STATUS: IMPROVED. Business impact: pending — AI-engine citation cannot be measured directly; read GSC impressions on the six audited queries and any brand-query appearance on 2026-10-04.

### Batch 8 — 2026-09-20 — structured data: one home graph, detail-page Offers on their own pages (brief of 2026-09-20)
- Phase 1 audit (no next-seo; 26 emitter files; `components/JsonLd` used on 14): before this batch the root layout emitted Organization + WebSite on every page; home added FAQPage, CollectionPage and the Article (five separate scripts); `/deals/[id]` Product (Offer url = the eBay listing, price = the shipping-inclusive total, auctions priced at the bid) + BreadcrumbList; `/cards/[slug]` Product with an Offer per live listing (eBay urls) + BreadcrumbList; `/sets`, `/pokemon`, `/deals` CollectionPage + ItemList + BreadcrumbList; guides Article + BreadcrumbList; `/about` AboutPage + BreadcrumbList; integrity Dataset. Live HTML matched the code on 20 Sep.
- Home (`5050714`): one `@graph` in one script from `lib/jsonLd.buildHomeGraph`, built from the render's own data — title/description/H1 constants (`lib/homeContent`), the scan timestamp behind "As of" as `dateModified`, the deals the feed renders in order as `#featured-deals` (name = card - set; `numberOfItems` = the live count; omitted with its reference when nothing renders), the visible FAQ array as `#faq`, the explanatory block as the Article. Organization (`#organization`, logo `#logo` = `/icon.svg`, `foundingDate` 2026-08-26 from the first production commit) and WebSite (`#website`) are on the home page only; inner pages reference them by `@id`. `#primaryimage` = the `/opengraph-image` route (1200×630 PNG). Every emitter serialises through `serializeJsonLd` (`<` → `<`).
- Detail pages: Offer `url` = the page's own canonical URL (no eBay or affiliate URL anywhere in JSON-LD); `price` = the item price excluding shipping as a plain decimal in the listing's currency, now visible ("Item price X + Y shipping" on deal and sealed pages; "incl. Y shipping · item X" on every card); "Card condition" / "Grade" properties; **auctions carry no Product** — 166 of 1,448 displayable deal pages on 20 Sep; ended listings carried none already. Card pages keep one Offer per live fixed-price listing rather than an AggregateOffer because listings across marketplaces are in different currencies and AggregateOffer takes one `priceCurrency`.
- Parameterised home views (`?page`, `?sort`, `?country`, `?type`, `?listing`, `?minPrice`, `?maxPrice`): the server always renders the default page-1 view; the client feed swaps content after hydration; every such URL is served `X-Robots-Tag: noindex, follow` and canonicalises to `/` (`next.config.mjs` HOME_VARIANT_PARAMS). The graph therefore describes the canonical page only.
- Tests: `tests/scanner/jsonld-graph.test.mjs` (round trip, `@id` resolution, positions/unique absolute URLs, FAQ mirror, placeholder scan, detail-page rules); `scripts/seo/jsonLdSmoke.mjs` (production fetch: one block on home, expected types present/absent, `Offer.price` visible, no eBay URL). Eight existing test files had their pins moved from the old contract.
- Production verified 2026-09-20 after `5050714` (`scripts/seo/jsonLdSmoke.mjs --deal=41354 --auction=41513 --ended=37849 --card=galarian-meowth-141-128-me-30th-celebration`): home — one block, one graph, Organization / WebSite / CollectionPage / FAQPage / ImageObject present, no Product, ItemList positions sequential with absolute URLs; deal 41354 — Product + Offer, `Offer.url` = the page, `Offer.price` 2450.00 visible in the page text, no eBay URL, no rating, BreadcrumbList; auction 41513 — no Product; ended 37849 — 308 to its card page, no schema; card — Product with 7 Offers all pointing at deal pages on this site, BreadcrumbList. STATUS: IMPROVED. Business impact: pending — product snippets and the site-name/logo feature are Google's to grant; re-run the Rich Results Test on the three URLs and watch Search Console's enhancement reports from 2026-10-04.

### Search Console actions taken 2026-09-20 (owner-authorised, UI)
Property `https://pokemondealfinder.com/` (URL-prefix).
- **Indexing requested** on the three templates the structured-data and GEO work changed: `/` ("URL is on Google", request accepted), `/deals/41354` ("URL is not on Google — Discovered, currently not indexed", request accepted), `/cards/galarian-meowth-141-128-me-30th-celebration` ("URL is not on Google", request accepted). Each returned the "Indexing requested … added to a priority crawl queue" dialog. Requests are a nudge, not a guarantee; nothing else needed re-submitting because the sitemaps already list every changed URL.
- **Sitemap index resubmitted**: `/sitemap.xml` → "Sitemap submitted successfully", Submitted now 20 Sept 2026 (was 27 Aug), 7,923 discovered pages, status Success. The bulk shard's own direct submission now reports **45 discovered pages** (was 5,857), which confirms batch 6's shard rule reached Google.
- Sitemaps table, read the same moment: cards-high 638 · cards-mid 1,440 · cards-low 3,124 · cards-bulk 45 · sets 209 · pokemon 923 · deals 1,417 · sealed-deals 63 · pages 64, all Success, all last read 19–20 Sept.
- Overview at the same read: 1,813 indexed / 25,248 not indexed; enhancements Breadcrumbs 43 valid, Data sets 1 valid; **Product snippets 0 valid / 0 invalid** — the new Offer contract had not been recrawled yet, which is exactly what these requests address. Re-read that row from 2026-10-04.

## DataForSEO first read — 2026-09-21 (live data; replaces every "est." figure)

Account verified by the owner 2026-09-21. Verification propagates
unevenly for an hour or so (the same endpoint alternated 20000 / 40104),
so `scripts/seo/dataforseo.mjs` retries that one code. Total spend for
everything below: **$0.43** of the $1.00 trial (balance $0.57). Raw
responses in `docs/seo/dataforseo/2026-09-21/`.

### Referring domains — the UNKNOWN is resolved, and the answer is worse than "few"

| Domain | Referring domains | Backlinks | Rank | First seen |
|---|---|---|---|---|
| **pokemondealfinder.com** | **3** | 3 | 0 | 2026-08-30 |
| pokedealfinder.com (near-name rival) | 11 | 11 | 0 | 2026-08-02 |
| dexcatch.com | 13 | 13 | 0 | 2026-08-03 |
| pokemonpricetracker.com | 50 | 123 | 107 | 2025-09-19 |
| pricecharting.com | 6,497 | 10,949,009 | 621 | 2019-01-16 |

All three of our referring domains are the same auto-generated listing:
`webmaster-philippines.com`, `gunghapcafe.com` and `pmt-ae.com`, each at
the identical path `/list/2026-08-29-109`, no anchor text, first seen
within days of launch. That is a scraper network that lists newly
registered domains, not an earned reference. **Earned referring domains:
zero.** No disavow is warranted (three auto-listings, no manual action);
the finding is simply that the authority ledger is empty and the pitch
pack is the only thing that changes it.

### Live Google positions (2026-09-21, DataForSEO SERP, depth 30)

| Query | Market | Our position | Who holds the top |
|---|---|---|---|
| pokemon card deals | US | **36** | Reddit, Best Buy, Giant Sports Cards |
| pokemon deal finder | US | not in top 30 | Reddit, tcgspy, pokedealfinder.tcgsales.co.uk |
| pokemon cards below market price | US | not in top 30 | Reddit, YouTube ×2, PriceCharting |
| charizard base set card value | US | not in top 30 | TCGplayer, PriceCharting, Reddit |
| shadowless charizard price | US | not in top 30 | PriceCharting, TCGplayer, Reddit |
| how much is my pokemon card worth | US | not in top 30 | TCGplayer, PriceCharting, PokeScope |
| pokemon card price checker | US | not in top 30 | TCGplayer, PokeData, Reddit |
| pokemon 30th celebration card list | US | not in top 30 | tcg.pokemon.com, PokeCottage |
| pokemon card deals | UK | not in top 30 | Amazon UK, Titan Cards, Reddit |
| pokemon card deals | AU | not in top 30 | Reddit, tcgspy, Collectible Madness |

### Real volumes for the target set (US, Labs keyword_overview)

| Keyword | Volume | Difficulty | CPC | Intent |
|---|---|---|---|---|
| pokemon card price checker | 14,800 | 19 | $1.19 | transactional |
| how much is my pokemon card worth | 2,400 | 22 | $1.93 | informational |
| pokemon card deals | 1,600 | 2 | $0.43 | commercial |
| pokemon booster box prices | 1,000 | 0 | $0.60 | commercial |
| shadowless charizard price | 480 | 0 | $0.30 | informational |
| pokemon card grading scale | 140 | 2 | $0.26 | informational |
| cheap pokemon cards ebay | 70 | 6 | $0.07 | transactional |
| raw vs graded pokemon cards | 20 | null | null | informational |
| charizard base set card value | 10 | null | null | informational |
| is buying pokemon cards on ebay safe | 10 | null | null | informational |

No data returned (below the index's threshold): "pokemon deal finder",
"pokemon cards below market price", "pokemon 30th celebration card list",
"delta reign release date", "graded pokemon card deals", "vintage pokemon
cards worth buying". **The brand query has no measurable volume** —
consistent with GSC's 2 impressions in 28 days.

### What we already rank for (Labs ranked_keywords, US, 69 keywords)

Every position is 44 or worse. The highest-volume ones are card-value
queries the catalogue already answers:

| Keyword | Volume | Our position |
|---|---|---|
| charizard xy | 2,900 | 82 |
| base set charizard price | 1,600 | 60 |
| how much is riolu worth | 1,300 | 44 |
| shadowless arcanine | 1,300 | 50 |
| dragons exalted rayquaza | 720 | 61 |
| charmander rc3/rc32 | 390 | 47 |

### What this changes

1. **Authority is no longer a hypothesis.** Three spam auto-listings and
   nothing else, against a near-name rival on 11 and the category leader
   on 6,497. Every ranking above is consistent with a site that has no
   external references at all.
2. **"pokemon card deals" is the reachable head term**: 1,600/mo,
   difficulty 2, commercial intent, and we already sit at 36. Difficulty 2
   means the competition is weak; what is missing is any authority signal.
3. **"pokemon card price checker" is the prize** (14,800/mo, difficulty
   19, transactional) and `/search` is the page for it, but it is not a
   near-term target at zero earned links.
4. **Stop optimising for the brand name.** It has no measurable volume,
   and five services share it.

### Batch 9 — 2026-09-21 — /deals browse guide, and a backlink watch
- Finding (DataForSEO first read, same day): "pokemon card deals" is 1,600/mo at **difficulty 2**, the lowest-difficulty term in the set with real volume, and the only URL of ours inside the top 30 is **`/deals/usa` at 36** — not the homepage and not `/deals`. The `/deals` page itself carried an H1, two caveat lines, a chip strip and the grid, and **no H2 at all**.
- Action (`fe371ef`): `components/DealsBrowseGuide` — five question-form H2s that open with the answer (what the list holds, how the filters work, when a saving is and is not shown, which category to browse, how often it changes) and a category table covering all twelve categories plus Japanese and sealed. Each row's description is derived from that category's own `intro` in the registry, so it cannot drift from the page it links to. Static: no data, no figures, no dates at render. Rendered **below** the grid, because listings are what the visitor came for (the homepage fold rule).
- Scope: kept to the long tail `docs/seo-headterm-strategy.md` assigns this page; no heading repeats the head phrase the homepage owns. Pinned in `tests/scanner/deals-browse-guide.test.mjs`.
- Production verified 2026-09-21 after `fe371ef`: the guide renders with all five question H2s, a 14-row category table (12 categories + Japanese + sealed) and 14 distinct category links, below the deal grid; the page's main content went from 1,456 words (mostly filter chrome) to 2,143. STATUS: IMPROVED. Business impact: pending — read position for "pokemon card deals" and the long-tail category terms on 2026-10-04.
- **Open question for the strategy, not acted on:** the August plan made `/` the primary candidate for the head term and reframed `/deals` as the browse sub-index, but Google is surfacing `/deals/usa`. Three pages now carry the phrase (`/` title + H1, `/deals` title, and the four country categories' titles). Whether to consolidate, and toward which URL, is a decision for the owner once the 2026-10-04 read shows whether yesterday's homepage changes moved it.
- `scripts/seo/backlinkWatch.mjs`: one referring-domains call (~$0.02), diffed against `docs/seo/backlink-snapshot.json`, reporting new and lost domains and flagging the known auto-generated listing shape (`/list/<date>-<n>`, no anchor) so a run never reads as progress when it is not. Baseline recorded 2026-09-21: 3 domains, all three the scraper network. Run it weekly, or whenever a pitch has been sent.

## Deep SEO / AI-SEO audit — 2026-09-21 (what earlier passes missed)

Run with live data (DataForSEO, Firecrawl, GSC UI) rather than assertion.
Four findings no previous pass had.

### 1. We were auditing the wrong head term

The market's head term is not "pokemon card deals" (1,600/mo). It is
**"pokemon card value" / "values" at 110,000/mo each**, difficulty 21–24,
with "pokemon card prices" at 22,200 and "newest pokemon set" at 60,500.
We are **not in the top 50** for any of them. TCGplayer and PriceCharting
hold the top two on all of them.

Our nearest peer by link profile, pokemonpricetracker.com (50 referring
domains to our 3), ranks 37–69 for the 110k terms across 2,360 keywords.
That is what ~50 earned links buys in this niche: page 4–7, not page 1.
Useful as a calibration for what the pitch pack can realistically achieve.

### 2. Two difficulty-2 terms our existing pages already answer, untargeted

| Term | Volume (US) | Difficulty | The page that already answers it | Does it use the phrase? |
|---|---|---|---|---|
| pokemon card list | 8,100 | **2** | `/cards` — "Pokemon Card Database & Prices", 210 sets, browse by Pokemon and by set | No |
| pokemon set list | 4,400 | **2** | `/sets` — "Pokemon Card Sets: Checklists, Prices & Values", 210 sets with checklists | No |

Difficulty 2 is the same score as "pokemon card deals", where we already
sit at 36 with no links at all. Combined 12,500/mo, informational intent,
and the content genuinely exists — set checklists are a real asset, not a
thin page. **This is the largest addressable gap in the audit** and the
cheapest: heading, title and lead-copy work on two pages that already
hold the data.

### 3. The crawl change is working, and the "25k not indexed" fear was misread

GSC Page indexing, read 2026-09-21 (was 24,952 not indexed on 20 Sep):

| Reason | Pages | Source |
|---|---|---|
| Discovered – currently not indexed | 13,060 | Google systems |
| Alternative page with proper canonical | 241 | Website |
| Crawled – currently not indexed | **41** | Google systems |
| Excluded by 'noindex' | 31 | Website |
| Page with redirect | 1 | Website |
| **Indexed** | **1,850** (was 1,813) | |

Not-indexed roughly halved in a day, 25,248 → 13,400, and indexed rose.
Crucially only **41** pages were fetched and then declined; 13,060 are
URLs Google knows but has not spent a fetch on. That is a priority
question, not a quality rejection — the batch 6 shard rule is doing
exactly what it was meant to. We now advertise 8,010 URLs across nine
sitemaps while Google knows ~15,000.

### 4. Internal linking is not a problem

Distinct internal links exposed per hub: `/pokemon` 1,052, `/cards` 321,
`/sets` 237, `/` 89, `/deals` 57, `/guides` 56, `/search` 36,
`/market-data` 31. No orphan tier; discovery is not the constraint.

### AI SEO — what is in place, and the one thing that decides it

In place and verified: robots names 15 retrieval/training agents
explicitly; `llms.txt` with dated freshness and quotable definitions;
answer-first blocks on `/` and now `/deals`; an entity graph with
Organization, WebSite, logo, sameAs and per-page FAQPage mirroring
visible text; Dataset markup on the first-party data pages.

The gap is not technical. AI answers are assembled from sources that are
already cited elsewhere, and in the ten SERPs sampled today **Reddit
appears in the top five for seven of them**, YouTube for three. We have
zero earned references and no community presence, so the probability of
being quoted is near zero regardless of on-page quality. The AI-SEO fix
and the classic-SEO fix are the same fix, and it is the pitch pack.

Not measurable this session: DataForSEO's `llm_mentions` endpoints
rejected three request shapes (40501/40503) — worth one more attempt
against their docs before concluding anything about model mentions.

### What could not be checked (resolved later the same day - see below)
- ~~**Core Web Vitals**~~: measured 2026-09-21 by running Lighthouse locally, which needs no PageSpeed quota. See "Performance, measured" below.
- **Whether AI crawlers actually fetch**: needs server logs, still not available here.
- ~~**LLM mention share**~~: measured 2026-09-21 once the correct endpoint was found. See "LLM citation, measured" below.

## Performance, measured - 2026-09-21

PSI kept returning 429 without an API key, so Lighthouse 12.8.2 was run
locally against production instead (`npx lighthouse`, headless Chrome).
These are lab numbers on a fast connection; field data still does not
exist at this traffic level.

This is the STARTING state. The corrected, canonical numbers and the
after-state are in "Performance verified in production" below; the mobile
column here came from `--preset=perf --form-factor=mobile`, which returns
a null Total Blocking Time and so a void score.

| Metric | Desktop | Mobile | Verdict |
|---|---|---|---|
| Performance score | 69 | void | mobile score void (null TBT under the chosen preset) |
| Largest Contentful Paint | 2.2 s | 3.4 s | |
| First Contentful Paint | 0.6 s | 3.4 s | |
| Cumulative Layout Shift | **0.43** | 0.167 | both above the 0.1 target; desktop is a clear fail |
| Total Blocking Time | 0 ms | null | no main-thread problem |
| Server response | 30 ms | | not the bottleneck |
| Total page weight | **12,718 KiB** | **8,750 KiB** | |

Server timing separately confirms the origin is not at fault: warm TTFB
on `/`, `/cards`, `/sets` and `/deals` is 0.09-0.11 s (`X-Vercel-Cache:
HIT`). The 1.0-3.3 s first-hit figures were cold ISR regeneration.

**The dominant cause was images**, 3,296 KiB of oversizing on mobile
alone - acted on in batch 11 below.

### CLS: cause found and fixed - 2026-09-21

The `layout-shift-elements` audit is empty, which is what made this look
unattributable. The attribution is in the **`layout-shifts`** audit
instead: four shifts, two of them carrying almost all the score, both on
the section below the feed - which is what *moved*, not the cause.

The cause was in `components/HomeFeed.js`. While a variant fetch was in
flight it rendered an **empty** feed, so the grid collapsed and then
re-expanded: the whole page below it moved twice. It fires on an
ordinary first visit - `components/RegionRedirect.js` applies the geo
default once `/api/rates` resolves, which changes the params and starts
that fetch. Lighthouse runs with empty storage, so it hit this every
time.

`components/DealGrid.js` never had the bug: it renders `<GridSkeleton />`
while loading, which holds the height. HomeFeed now keeps the last
rendered feed on screen instead, marked `aria-busy` and dimmed by opacity
alone. Nothing about the outcome changes - same final content, same geo
default, same fold order - and the stale frame is the content the visitor
was already looking at, because it is what the server rendered. Pinned in
`tests/scanner/home-feed-cls-2026-09-21.test.mjs`.

**Why batch 11 appeared to make CLS worse.** Between the two runs the
shifts themselves were identical (0.423 + 0.374 desktop, unchanged), but
the total went 0.43 to 0.80. That is the session-window algorithm, not a
regression: with the page now loading in a fraction of the time, both
shifts fall inside one scoring window and sum instead of being counted
separately. `unsized-images` stayed at a perfect score with zero items
across every run, so the new `<img>` tags contributed no shift at all.
The slow page had been hiding half the defect.

## Performance verified in production - 2026-09-21

Both fixes deployed and re-measured with local Lighthouse 12.8.2.

**Read the configuration note first.** The mobile "before" runs in this
session used `--preset=perf --form-factor=mobile`, which returned a null
Total Blocking Time and so a void score. Those runs are internally
consistent and fine for the weight and CLS comparison, but they are NOT
canonical mobile numbers. Lighthouse's own default (mobile emulation,
simulated slow 4G) is, and the final mobile column below is that default.
Do not compare the mobile score column across the two configurations.

| | Desktop start | Desktop final | Mobile start | Mobile final |
|---|---|---|---|---|
| Performance score | 69 | **97** | void | **88** |
| Total page weight | 12,718 KiB | **2,103 KiB** | 8,750 KiB | **1,136 KiB** |
| First Contentful Paint | 0.6 s | 0.4 s | 3.4 s | 1.4 s |
| Largest Contentful Paint | 2.2 s | **1.2 s** | 3.4 s | 3.9 s (see below) |
| Cumulative Layout Shift | 0.43 | **0.009** | 0.167 | **0.001** |
| Total Blocking Time | 0 ms | 0 ms | null | 20 ms |
| Speed Index | 0.6 s | 0.8 s | 4.1 s | 2.6 s |

STATUS: IMPROVED. CLS now passes comfortably on both (target 0.1); the
largest remaining shift is 0.0065 on desktop, below the noise floor.

Confirmation the image fix works end to end: in the final mobile run the
two priority deal photos transfer at **23 KB and 20 KB** (`s-l225`),
against roughly 800 KB each before.

### Mobile LCP: not a defect, and the earlier reading was wrong

An earlier note in this file said mobile LCP was "97 % render delay" and
needed investigation. That came from the misconfigured preset above.
The corrected picture, from the default mobile run:

| | Simulated | Observed |
|---|---|---|
| First Contentful Paint | 1,443 ms | 1,367 ms |
| Largest Contentful Paint | 3,870 ms | **1,367 ms** |
| Speed Index | 2,621 ms | 1,459 ms |

**Observed LCP equals observed FCP.** The LCP element - the answer-capsule
paragraph in the homepage header, static server-rendered text - paints at
the same instant the page first paints. There is no render delay and
nothing is waiting on it. Its dependencies are all complete by about
1.27 s: the document lands at 950 ms, the one render-blocking stylesheet
(25 KB) at 1,266 ms, the three self-hosted fonts by 1,250 ms, and
`render-blocking-resources` estimates 0 ms of available savings.

The 3,870 ms is Lighthouse projecting that paint onto a simulated slow-4G
phone, where the number is set almost entirely by the modelled time to
fetch the HTML document and its stylesheet. The only levers on it are
shrinking the document or inlining critical CSS.

**Judged not worth doing now**: every other mobile metric passes, the
element already paints at first paint, and inlining critical CSS is a
real risk to a working render path for a number that no real user
experiences. Revisit only if field data (Search Console Core Web Vitals,
which still reports "No data" at this traffic level) shows real users
failing LCP.

### Every template measured - 2026-09-21

The homepage was one page. All six templates, Lighthouse default mobile
config, each warmed first (see the caveat below):

| Template | Score | Weight | FCP | CLS | TBT | Speed Index |
|---|---|---|---|---|---|---|
| `/` | 88 | 1,136 KiB | 1.4 s | 0.001 | 20 ms | 2.6 s |
| `/deals` | 89 | 796 KiB | 1.5 s | 0 | 0 ms | 3.1 s |
| `/cards` | 95 | 1,201 KiB | 1.5 s | 0 | 50 ms | 2.0 s |
| `/sets` | 96 | 992 KiB | 1.3 s | 0 | 30 ms | 1.3 s |
| `/cards/[slug]` | 89 | 693 KiB | 1.3 s | 0 | 30 ms | 2.3 s |
| `/deals/[id]` | 95 | 784 KiB | 1.3 s | 0.006 | 20 ms | 1.5 s |

**No template has a performance defect.** CLS passes everywhere with room
to spare (worst 0.006 against a 0.1 target), Total Blocking Time is at
most 50 ms, and first paint is 1.3-1.5 s across the board.

Simulated LCP sits at 2.8-3.9 s on every one of them, and that uniformity
is itself the evidence: it is a property of the slow-4G network model
applied to the document plus its stylesheet, not a per-page fault.
Observed first paint on the same runs is 0.26-1.4 s. Same conclusion as
the homepage - do not chase it without field data.

**Operational caveat, learned the hard way.** The first `/deals` run
scored a Speed Index of 7.4 s with observed first paint at 4,926 ms. That
was a cold ISR regeneration, not the page: warmed with a single request
first (`curl -o /dev/null`), the same URL returns 89 with observed first
paint at 1,274 ms and Speed Index 3.1 s. **Always warm a URL before
measuring it**, or the regeneration cost lands inside the metric and
reads as a rendering fault.

## Search Console query data, read directly - 2026-09-21

`npm run seo:striking` (new, `scripts/seo/strikingDistance.mjs`): one
read-only Search Analytics call, free, no Search Console change. It was
written to find "striking distance" queries - the ones sitting just off
page one, where a small move is worth the most.

**It found that there is no striking-distance work worth doing, and the
denominator is why.** Window 2026-08-22 to 2026-09-19:

| | |
|---|---|
| Impressions | 428 |
| Clicks | 3 |
| Distinct queries | 311 |
| Best single query | 13 impressions |
| In the 8-25 band with 3+ impressions | 8 rows, 45 impressions |

The top ten queries by impressions produced **zero clicks between them**.
An average query brings 1.4 impressions in four weeks. Nothing here can
be optimised into traffic, because there is no traffic to move: at
positions 8 to 31 with 4 to 13 impressions, a two-position gain is worth
a fraction of one click. This is the authority diagnosis showing up in a
third independent source, and the report prints the whole-window totals
above the opportunity list precisely so it can never be read as "here are
eight easy wins".

**The useful output was the template breakdown**, which is a real
baseline for where earned visibility actually lives:

| Template | Impressions | Clicks | Share |
|---|---|---|---|
| `/cards/[slug]` | 118 | 0 | 28 % |
| `/guides/*` | 89 | 1 | 21 % |
| `/deals/[id]` (ephemeral) | 54 | 0 | 13 % |
| `/pokemon/[slug]` | 48 | 0 | 11 % |
| `/news/*` | 36 | 1 | 8 % |
| `/deals/[country or category]` | 36 | 1 | 8 % |
| `/sets/[slug]` | 15 | 0 | 4 % |
| `/` (home) | 11 | 0 | 3 % |

Three things follow, none of them requiring a change today:
1. **The permanent card pages are the workhorse.** They earn more
   impressions than any other template, which validates the card-page and
   printings investment rather than the deal grid.
2. **The homepage earns 3 % of impressions.** The August strategy
   designated `/` as the head-term page; Search Console says it is the
   eighth-largest earner of the ten templates. That is evidence for the
   open cannibalisation question recorded under batch 9, and the
   2026-10-04 read should settle it.
3. **13 % of impressions land on `/deals/[id]`, which are ephemeral.**
   Those URLs 308 to the card page when the listing ends, so equity is
   not lost, but card-identity queries like "arcanine shadowless" are
   being answered by a listing page rather than the permanent hub. Worth
   watching, not worth acting on at 54 impressions.

## The keyword-gap strategy is exhausted - 2026-09-21

Batch 10 worked by finding terms an existing page answered but never
named. `npm run seo:gaps` (`scripts/seo/lowDifficultyGaps.mjs`) was
written to find more of them systematically rather than by hand: one
`keyword_ideas` call seeded from what the site actually holds, filtered
to difficulty <= 12 and volume >= 300, then cross-checked locally and for
free against the routes and copy that already exist.

**It found the opportunity, and then found the work was already done.**

The on-domain pattern is `<set name> card list`, and it is large:

| Term | Volume/mo | Difficulty | We hold the set page |
|---|---|---|---|
| chaos rising card list | 90,500 | 2 | yes (`me04-chaos-rising`) |
| phantasmal flames card list | 74,000 | 2 | yes (`me02-phantasmal-flames`) |
| ascended heroes card list | 74,000 | 1 | yes (`me-ascended-heroes`) |
| mega evolution card list | 60,500 | 2 | yes |
| journey together card list | 33,100 | 0 | yes (`sv09-journey-together`) |
| surging sparks card list | 22,200 | 0 | yes (`sv08-surging-sparks`) |
| prismatic evolutions card list | 18,100 | 0 | yes |
| black bolt card list | 12,100 | 3 | yes |
| paldean fates card list | 9,900 | 4 | yes |
| obsidian flames card list | 9,900 | 0 | yes |
| shrouded fable card list | 8,100 | 0 | yes |
| 151 card list | 8,100 | 6 | yes |

**420,500 searches a month, difficulty 0-6, and we have a page for every
one of them.** All 210 set pages already carry the phrase: the live
`/sets/sv08-surging-sparks` title and H1 are both "Surging Sparks Card
List, Prices & Values", and the page uses "card list" 22 times and
"checklist" 17 times in real copy.

Then Search Console (`npm run seo:striking --grep=`):

| Query family | Impressions, 28 days | Positions |
|---|---|---|
| anything containing "card list" | **3** | 57, 60, 75 |
| anything containing "sparks" | **0** | - |
| anything containing "expensive" | **0** | - |

**The biggest low-difficulty opportunity on the site is already fully
optimised and earns three impressions a month at position 57 to 75.**

### What this settles

There is no further on-page keyword work worth doing. The play that
produced batch 10 has been run to its end: the remaining terms are ones
we already target correctly. A DataForSEO difficulty of 0-2 is a
link-based score that assumes some baseline authority; at three referring
domains, all of them scraper-generated, the site sits below the floor
where that score means anything. Page six is not a phrasing problem.

This is the fourth independent source to reach the same conclusion, after
the referring-domain count, the LLM citation read and the
striking-distance report. **Do not commission more keyword research or
more page copy against these terms.** `docs/pitch-pack.md` is the lever.

### The one content gap that is real, and why it waits

"most expensive pokemon card" is 110,000/mo at difficulty 0 and we have
no page for it - zero impressions in the window. `/cards` carries a
"Highest market references we track" section, which is the raw material,
and the honest version of that page is one we could build from held data
without inventing a figure. **Recommended, but not now**: on today's
authority it would land beside the set pages on page six. Revisit when a
pitch has landed and something has moved.

## LLM citation, measured - 2026-09-21 (this corrects the audit above)

The audit said we have "zero earned references ... so the probability of
being quoted is near zero". **That was wrong, and the corrected figure is
more useful than the guess.**

The earlier attempts failed because the endpoint was guessed. The real
family is `/v3/ai_optimization/llm_mentions/*` (DataForSEO AI
Optimization API); `target_metrics/live` is the one that answers this,
at about $0.10 a call. Two further traps, both now encoded in
`scripts/seo/llmMentions.mjs` so they are not re-learned:

- Multiple `include` targets are **ANDed** - one answer must cite them
  all - so a four-peer call returns nothing and reads as zero. One target
  per call.
- `total_count: 0` is not zero mentions. The answer is in
  `aggregated_metrics.sources_domain`.

**pokemondealfinder.com: cited 6 times, AI search volume 86.** Not zero.
Every one of those citations is on **chat_gpt; zero on google**.

The domains ChatGPT cites alongside us on the same questions:

| Domain | Mentions | AI search volume |
|---|---|---|
| **pokemondealfinder.com** | **6** | **86** |
| www.pricecharting.com | 4 | 48 |
| pokemoncardscanner.app | 2 | 43 |
| www.pokemonwizard.com | 1 | 35 |
| doubleholo.com | 1 | 35 |
| cardtrack.com | 1 | 35 |
| www.kardview.com | 1 | 20 |
| packspy.com | 1 | 20 |

Control run on tcgplayer.com, to show the query works and to scale ours:
103,595 mentions, AI search volume 26,971,478 - and its split is the
mirror of ours, **98,694 on google against 8,703 on chat_gpt**.

What this changes:
1. We are already in the ChatGPT answer set for this niche, at the
   bottom of it, among the small tools rather than the incumbents. The
   on-page AI-SEO work was not wasted.
2. **Google's AI surfaces are where the volume is** (26.8 M against
   286 k AI search volume for TCGplayer) **and they cite us zero times.**
   That, not ChatGPT, is the gap.
3. Google's AI answers draw on classic ranking, so this stays the same
   fix as the classic one - the pitch pack - but the baseline is now a
   number that can be re-read, not an assumption.

Re-read with `node scripts/seo/llmMentions.mjs` after any pitch lands.
Spend this session: $0.303 across three calls (one wasted on the ANDed
multi-target shape, which is why it is written down).

### Batch 10 - 2026-09-21 - /cards and /sets target the two difficulty-2 list terms
- Finding (deep audit, same day): "pokemon card list" 8,100/mo and "pokemon set list" 4,400/mo, both **difficulty 2**, both already answered by an existing page that never used the phrase.
- Action (`24823a2`): `/cards` title and H1 -> "Pokemon Card List & Price Database"; `/sets` title -> "Pokemon Set List: Every Set & Checklist", H1 -> "Pokemon Set List: Checklists, Prices & Values". Both leads rewritten to answer what the list is and what opening an entry gives you. Each phrase appears exactly three times per page (title, H1, lead); `tests/scanner/list-terms-2026-09-21.test.mjs` fails below three or above five, and forbids hardcoded counts in the description or prices/superlatives in header copy. The homepage's head term is untouched, so no new internal competition.
- Production verified 2026-09-21: `/cards` serves "Pokemon Card List & Price Database" in title and H1; `/sets` serves "Pokemon Set List: Every Set & Checklist" / "Pokemon Set List: Checklists, Prices & Values"; both descriptions carry the phrase and fit a SERP. STATUS: IMPROVED. Business impact: pending - read position for both terms on 2026-10-04.

### Batch 11 - 2026-09-21 - deal photos served at the size they are displayed
- Finding (Lighthouse, same day): the homepage weighed 8,750 KiB on mobile, 3,296 KiB of it images served far larger than they render. A deal card shows its listing photo at 116 CSS px; the browser was fetching eBay's 1600 px original, measured at 853 KB for one thumbnail.
- Cause: `lib/ebayLinks.js` stores every listing photo at `s-l1600` deliberately, because the stored URL is the counterfeit-screening worker's evidence. That is correct and unchanged. The defect was in rendering: eBay photos bypass Vercel Image Optimization (VERCEL-COST-1), and `next/image` renders an unoptimized image as a bare `<img>` with no srcset, so nothing ever asked for a smaller copy.
- Action: `lib/ebayImageSizes.js` builds a srcset across six eBay CDN widths, and `components/DealImage.js` renders eBay photos through it against the `sizes` each layout already declares. Every width was verified against the CDN first - all nine of eBay's sizes returned 200 with genuinely different payloads (s-l225 26 KB through s-l1600 853 KB) - and `tests/scanner/ebay-image-sizes-2026-09-21.test.mjs` fails if a width outside that measured set is ever requested. No API call, no stored value changed, no new host, and the catalogue-art path still goes through the optimizer exactly as before.
- `tests/helpers/r3RouteHarness.mjs`: the new module added to the `pure` allowlist. Without it 40 R3 tests fail with "Unapproved R3 harness dependency" - the recurring gotcha whenever a component gains a lib import.
- Ratchet after the change: 33 failing / 33 quarantined, unchanged from baseline.
- CLS was not addressed by this batch and was fixed separately the same day - see "CLS: cause found and fixed" above (`817a2ad`). Note that this batch appeared to make CLS worse (0.43 to 0.80 desktop) purely because the faster page put both existing shifts inside one scoring window; the shifts themselves were unchanged and `unsized-images` stayed perfect throughout.
- Production verified 2026-09-21: the responsive set is served on the homepage grid and the deal detail hero. Desktop page weight 12,718 to 2,103 KiB, mobile 8,750 to 1,136 KiB; the two priority deal photos now transfer at 23 KB and 20 KB against roughly 800 KB each. STATUS: IMPROVED.

## Measurement calendar
- **2026-10-04**: GSC Core Web Vitals - check whether field data has appeared now that lab CLS is 0.009/0.001 and mobile weight is down 87 %; it read "No data" on 21 Sep.
- **2026-10-04**: position for "pokemon card list" and "pokemon set list" (batch 10).
- **2026-10-04**: GSC CTR on retitled pages; Delta Reign guide impressions; Page indexing "Discovered – not indexed" after the bulk-shard change; PostHog guide_offers clicks.
- **2026-10-11**: price_history provenance depth → decide #6.
- **2026-10-28**: species experiment 6-week review → decide #7.

## Blockers
- Search Console API token is read-only (no sitemap resubmission / removal, no indexing API); UI actions done by hand when authorised. The direct `/sitemaps/cards-bulk.xml` submission is now consistent with the index (batch 6); removing it is optional tidying, not required.
- GSC Links report: "Processing data" on 2026-09-20. Superseded for practical purposes by the DataForSEO backlink read (3 referring domains, all auto-generated); re-read anyway to confirm Google sees the same.
- DataForSEO: **resolved 2026-09-21** - account verified by the owner, first read run for $0.43, results in the section above and in `docs/seo/dataforseo/2026-09-21/`. Balance $0.57. Note for the next run: `bulk_search_volume` answers "Invalid Path"; use `dataforseo_labs/google/keyword_overview/live` (volume + difficulty + intent in one cheap call).
- Vercel Web Analytics events (`eBay Click`) not readable from this session (MCP tool unavailable; dashboard domain not permitted in the browser).
- PageSpeed Insights anonymous quota exhausted 19 Sep; CrUX has no field data (traffic too low).

## Coverage of the 20 assignment areas (status as of 2026-09-20)
Compact reconciliation from the records above and `docs/growth-upgrade-2026-09.md`; not a new audit.

| # | Area | Status | Where / provenance |
|---|---|---|---|
| 1 | Crawlability & technical baseline | Verified working | robots (explicit AI agents), sitemap index (`lib/sitemap.js`), canonicals, pagination `nofollow` beyond page 5 (`9d99d4a`); bulk shard first unadvertised (`b2f3272`), then resolved to hubs + article-linked cards and re-advertised (`797d9cb`, batch 6). Crawl stats read 20 Sep (above). |
| 2 | Indexation & page quality | Verified (sampled), not exhaustive | URL Inspection on one page per template 20 Sep: all "Submitted and indexed"; substance gates unchanged (`lib/indexability.js`, `docs/indexability.md`); `/saved` noindex. |
| 3 | Search Console opportunity mining | Completed | Property `https://pokemondealfinder.com/`, web search, 05–19 Sep (13 clicks / 820 impr), `docs/seo/gsc-weekly-2026-09-15.md`, `docs/gsc-indexation-audit.md`; sparse-data caveats recorded. |
| 4 | Search demand & content gaps | Completed (sampled) | SERP sample of 3 intents, US, 20 Sep → printings block (batch 2); buyer-intent guides (19 Sep). |
| 5 | Programmatic SEO | Deferred with reason | No new template; species intros held by the experiment window (2026-10-28 / 11-11); `cards-low` shard awaits the bulk-shard measurement. |
| 6 | Original data & market analysis | Partly completed; price movers deferred | `/market-data/pokemon-reference-price-changes` (150 products, 1,147 variants, 12 Aug–11 Sep) and the value-distribution page exist; price-movers asset deferred to ≥ 2026-10-11 (verified provenance only since 11 Sep). |
| 7 | Linkable assets & digital PR | Completed (drafts); sending is the owner's | `/integrity` (CC BY, daily snapshots since 20 Sep), the reference-price study, buyer's checklist; `docs/pitch-pack.md` revised 20 Sep with five reviewed prospects and drafts. Not sent. |
| 8 | Internal linking | Completed | Printings block, related cards, guide→set offers, editorial relations (`lib/editorialRelated.js`), guide link registry with per-guide caps. |
| 9 | Card pages | Completed + verified; one fix this batch | Worth answer, graded lines, printings on both render paths (`e179425`), ghost control; legend fix (batch 5). |
| 10 | Set pages | Watch, not build | 77 % of set views are one checklist-intent page; template already competitive in the SERP sample. |
| 11 | Pokemon entity pages | Deferred with reason | Experiment cohorts untouched until 2026-10-28. |
| 12 | Editorial clusters | Completed + extended | 30th cluster, Delta Reign cluster (`f6bd9b4`), buyer-intent guides; card art on every guide but one (batch 4). |
| 13 | Freshness & sold listings | Verified working | `lastmod` from catalogue sync (`9d99d4a`); ended listings redirect to the card's current listings; integrity snapshot cron 05:40 UTC. |
| 14 | Structured data | Verified | Rich Results Test 20 Sep: deal page 4 valid items; `/integrity` Dataset + Breadcrumb + Organization; no merchant fields on third-party offers (SEO-2.6.1). |
| 15 | Titles & CTR | Completed; measure 2026-10-04 | Commit `9d99d4a` (deployed 2026-09-19 ~21:35 UTC): home, /deals, /guides, /integrity, /methodology, /news, /pokemon, /best-finds, vintage and graded category titles, descriptions ≤ 160; card/set templates already identity-first. Changed URLs listed in the commit. |
| 16 | New release coverage | Completed for the next release; set page awaits the English list | Delta Reign guides + news; `/latest-releases`; ingestion untouched. |
| 17 | Performance / CWV | Blocked for field data; lab hints shipped | `fetchPriority` on LCP images and preconnects (`9d99d4a`); PSI quota exhausted, CrUX empty. |
| 18 | Affiliate value & conversion | Completed; measured from 2026-10-04 | Batches 1–3; sponsored rel, EPN params untouched, browsing kept visibly distinct from deals. |
| 19 | Competitive gaps & authority | Completed (sampled); authority reframed | SERP sample 20 Sep; clone sites noted for the owner; authority now recorded as a hypothesis with its evidence path (above). |
| 20 | SEO→revenue measurement | Verified wiring; one definition corrected | PostHog `affiliate_click` dimensions, `npm run report:growth`; batch 3's measure corrected to the Vercel event; duplicate check 0. |
