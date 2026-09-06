# SEO-GSC-4 — Authority + backlink opportunity audit

**Date:** 2026-09-07 · **Status:** RESEARCH / PROSPECTING / OUTREACH-PREP
only. **Nothing was sent, submitted, posted, or published.** This document
is an approval-ready prospect pack.

Labels: **[VERIFIED]** = confirmed from a live source this session ·
**[PROSPECT]** = a candidate to research further before contact ·
**[INFERENCE]** = reasoning, not a fact · **[REJECTED]** = deliberately
excluded, with reason.

---

## 0. Tooling available for this audit

- **[VERIFIED]** No Ahrefs / Semrush / Majestic / Moz backlink API, and no
  Search Console "links" export, is available in this environment. There
  is **no way to produce a real backlink list, referring-domain count,
  Domain Rating or Domain Authority.** None is invented below.
- Available: `WebSearch`, `WebFetch`, a browser, and the live GSC
  read-only OAuth from SEO-GSC-1 (`scripts/_gscAudit.mjs` — search
  analytics / sitemaps / URL inspection; **no** links report).
- Method used: exact-domain and brand searches, tool-roundup / resource-
  page discovery searches, and targeted `WebFetch` verification of the
  strongest candidates.

---

## 1. Current authority footprint

**[VERIFIED] The public footprint of `pokemondealfinder.com` is
effectively nil.**

| check | result |
|---|---|
| `"pokemondealfinder.com"` (exact) web search | **0 pages that mention or link the domain.** Results were unrelated: `pokemondeal.com`, `pokemondealsfinder.com` (a different, established site — see the name-collision note), an X account `@PokemonDealsTCG` (unrelated), Wikipedia noise. |
| `"Pokemon Deal Finder"` brand search | no result for this site; the phrase resolves to generic/other entities |
| Reddit / forum mentions | none found |
| directory / tool-list inclusions | none found |
| social profiles for this brand | none found (no X, no YouTube, no Discord tied to this domain) |
| GSC (SEO-GSC-1, 2026-09-06) | **0 brand-name queries**, 0 referring signals implied — consistent with a domain crawled for the first time ~2 weeks ago |

**[INFERENCE]** This is the expected state for a domain this age with no
promotion. It also means **every** legitimate link or mention from here is
net-new authority — there is no cleanup or disavow work, only acquisition.

**[VERIFIED] Name-collision risk:** `pokemondealsfinder.com` (extra "s")
is an existing sealed-product deal search engine with a Discord. Outreach
copy and any brand mentions must use the full URL `pokemondealfinder.com`
every time to avoid being conflated with it (or with `pokemondeal.com`).

---

## 2. Linkable-asset audit — what PokemonDealFinder can genuinely offer

Ranked by strength as a **reason for an editor to link**, not by internal
importance.

| rank | asset | URL | why it's linkable | weakness |
|---|---|---|---|---|
| **1** | **Card price-distribution / market-shape data** | `/market-data/pokemon-card-value-distribution` | A single citable statistic set (population of priced cards, % under $5 / $25 / $100, median raw reference) computed from ~29k cards. Writers cite numbers, not tools. The outreach system **already** freezes these into a `snapshot` for data pitches. | needs to be kept current; one page |
| **2** | **The grading / condition cluster** (SEO-GSC-3) | `/guides/card-condition-grading`, `/guides/pokemon-card-grading-scale`, `/guides/how-to-check-pokemon-card-condition` | Genuinely useful, evergreen, no affiliate pressure, deterministic tables (grade scale, the four inspection axes). Fits "evaluating a card" / "is it worth grading" articles that already exist in volume. | brand-new, unranked; graders' own blogs compete |
| **3** | **The tool itself — live below-market eBay discovery** | `/` and `/deals/under-25`, `/best-finds`, `/deals/graded` | The one thing the adjacent tools (PriceCharting, TCGplayer, PokeData, PokePrices, Collectr…) don't do: surface listings *currently priced below a market reference*. A real category gap in every "best price tools" roundup. | "deal finder" reads as commercial; roundups are cautious about affiliate sites |
| **4** | **Per-card raw + graded reference pages** | `/cards/[slug]` (~23.6k) | Deep, permanent, structured. A "what is my X worth" article can deep-link a specific card. | thin individual pages; competes with every price-guide site |
| **5** | **Species & set catalogue hubs** | `/pokemon`, `/pokemon/[slug]`, `/sets`, `/sets/[slug]` | "All Charizard cards" / "Base Set checklist with prices" resource intent. | catalogue, not editorial; low novelty |
| **6** | **Methodology / deal-detection explanation** | `/methodology` | Transparency page — useful as the "how it decides a deal" link inside a data pitch. | supporting asset only, not a standalone target |

**[INFERENCE] The homepage is NOT the default outreach target.** For a
resource-list it's `/` or `/deals/under-25`; for a data pitch it's
`/market-data/pokemon-card-value-distribution`; for a grading article it's
the relevant `/guides/*` page; for a "what's X worth" mention it's the
`/cards/[slug]` or `/pokemon/[slug]`.

---

## 3. Qualification model (deterministic)

Score each prospect 0–100. All sub-scores are integer bands with written
rules so two people (or Claude, later) score the same prospect the same.

| factor | weight | 0 | 5 | 10 | 15 |
|---|---:|---|---|---|---|
| **Relevance** | ×2 | off-topic | trading cards, not Pokémon-specific | Pokémon TCG | Pokémon TCG **pricing / deals / grading** specifically |
| **Editorial quality** | ×2 | link farm / auto-generated | thin SEO page | real articles, some depth | genuine editorial voice, named author, updated |
| **Likelihood to link** | ×2 | never links out | links out rarely | has a resource/tools list or cites tools in prose | **actively curates** a tools list / has added new entries recently |
| **Authority / trust signal** | ×1 | brand-new / unknown | small but real | established in the hobby (years, community presence) | widely referenced hub (PokéBeach-tier) |
| **Traffic / visibility signal** | ×1 | no ranking evidence | ranks for a few long-tails | ranks page-1 for a tool/roundup query | ranks page-1 for multiple commercial queries |
| **Contactability** | ×1 | no contact route | contact form only | role/email discoverable OR active forum account | named editor email OR responsive public inbox |
| **Spam risk (inverse)** | ×1 | PBN / paid-link seller / casino-adjacent | many outbound "sponsored" links | mostly clean | clean, no paid-link footprint |

Score = Σ(band × weight). Max = 130 → normalise to /100.

**Hard rejects (score 0, do not contact) — [REJECTED] categories:**
link farms, PBNs, paid-link networks, "DA 90 backlink package" sellers,
mass guest-post farms, automated comment/profile links, casino / crypto /
adult / general-spam sites, scraped-content directories, and any site
whose "write for us" page sells placement.

**Tier bands (expected value, not raw size):**
- **Tier A** = score ≥ 70 **and** a realistic path to a link within one
  or two touches (curated list that takes submissions, a writer who cites
  tools, a data pitch with a specific home).
- **Tier B** = score 55–69, or ≥ 70 but harder to land (big site, slow,
  needs a strong hook).
- **Tier C** = score 40–54 — worth a light touch or a "later" note.
- Below 40 → not in the pack.

---

## 4. Outreach angles

| code | angle | when it applies | target URL |
|---|---|---|---|
| **A** | **Resource / tool-list inclusion** | the page is a curated list of Pokémon card price/deal/grading tools and it links out | `/` or `/deals/under-25` |
| **B** | **Broken / outdated resource replacement** | a genuinely dead or defunct tool link exists on their list (verify the 404/defunct-redirect first) | whichever PDF page fills the same slot |
| **C** | **Data / market-insight citation** | a writer publishes market analysis or "value" pieces and would cite a stat | `/market-data/pokemon-card-value-distribution` (with a frozen `snapshot`) |
| **D** | **Guide citation** | an article discusses evaluating a card's condition or whether to grade | the matching `/guides/*` page |
| **E** | **Tool discovery for a roundup** | a "best Pokémon card price tools" listicle that is missing the *deal-finding* category entirely | `/` |
| **F** | **Contributor data for a journalist / blogger** | someone writing a story who can use a verifiable figure or a screenshot of a real current deal | the specific deal/data page, plus `/methodology` as the "how" link |

**Not used:** reciprocal-link swaps, "I loved your article" openers,
paid placements, mass templated blasts, or any framing that hides that
the sender runs the site (`lib/outreach/core.js` `ownershipLanguageOk`
already blocks the latter).

---

## 5. Prospect list

**[PROSPECT] for every row below.** Contact emails are **not** recorded —
none was verified this session, and the rule is publicly-listed
professional contact only. Each row records the *route* to a contact; the
actual address/handle is found and verified at draft time. Target counts:
~40 researched here; the top 20 are tiered in §6.

Legend for **Route**: `list-submit` = the page/thread takes reader
submissions; `form` = site contact form; `editor` = a named
writer/editor to find; `forum` = post/reply in-thread as a member;
`social` = X / YouTube-about / Discord.

### 5a. Curated tool roundups & retailer editorial blogs (angle A / E / D)

| # | domain | page (verify live) | why relevant | PDF target | angle | evidence it links to similar | route | score |
|---|---|---|---|---|---|---|---|---:|
| 1 | packz.io | `/blog/best-pokemon-card-price-checker`, `/blog/pokemon-card-price-checker` | dedicated "best price checkers" roundups; **already a DRAFT in `records.json`** (id `packz`) | `/` | E | the posts list PriceCharting, TCGplayer, PokeScreener etc. | form / editor | 78 |
| 2 | delightfultcg.com | `/blogs/articles/best-apps-to-track-your-pokemon-card-collection-value`, `/blogs/articles/how-to-track-pok-mon-card-prices-over-time`, `/blogs/articles/best-pokemon-card-checklist-apps-for-iphone-and-android` | retailer with a **genuine editorial blog** that ranks for and links out in tool roundups | `/` (tracking) + `/deals/under-25` | E | ranks p1 for "best app to track pokemon card collection value", names Collectr/TCGplayer/CardLadder | form / editor | 80 |
| 3 | tcginvest.io | `/blog/best-pokemon-card-investment-tools` | "best investment tools" list, "tested, updated" framing | `/` + `/market-data/...` | E / C | curates tools with pros/cons | editor / form | 72 |
| 4 | rarecandy.com | `/blog/find-pokemon-card-value` | "how to check value fast & free" — a slot for a deal-finding tool | `/cards` + `/` | A / D | prose-cites external value tools | editor | 66 |
| 5 | doubleholo.com | `/articles/how-to-find-pokemon-cards-value` | "pro guide" to finding value; deal discovery is the missing step | `/` | E | article format, cites methods/tools | editor | 60 |
| 6 | pokiframe.com | tools / links section (verify) | free price checker with content pages — adjacent, may keep a links page | `/` | A | is itself a tool that aggregates sources | form | 55 |
| 7 | pokescope.app | blog / resources (verify) | price checker + collection manager with a blog | `/deals/under-25` | A / C | aggregates TCGplayer/CardMarket/eBay data | form | 55 |

### 5b. Community-maintained resource lists (angle A / D — CONDITIONAL, member participation)

| # | domain | page | why relevant | PDF target | angle | evidence | route | score |
|---|---|---|---|---|---|---|---|---:|
| 8 | elitefourum.com | `/t/list-of-pokemon-tcg-resources/49904` | **[VERIFIED]** actively maintained (updated 2026-06), **accepts community suggestions**, has a "Guides" + "External Databases" section | `/guides/card-condition-grading` (fits Guides) ; deal finder is a stretch | D / A | maintainer takes reader-suggested resources in-thread | forum (member, then suggest) | 68 |
| 9 | pokebeach.com | `/forums/threads/pokemon-tcg-resources-and-links.108554/` | PokéBeach = a top-tier Pokémon TCG news site since 2003; long-running resources thread | `/` + `/guides/*` | A / D | thread is literally a link list | forum | 74 |
| 10 | justinbasil.com | resources / guide index (verify) | well-known free TCG resource hub (JustInBasil) | `/guides/*` | D | curates guides & tools | form / editor | 64 |
| 11 | pokecottage.com | resources / links (verify) | collector reference site (master-set guides, checklists) | `/sets` + `/pokemon` | A | reference-site link section likely | form | 55 |
| 12 | tcgcollector.com | community / links (verify) | large collection tracker with a community | `/sets` | A | — (verify a links page exists) | form | 52 |
| 13 | pkmn.gg | resources (verify) | tracker + deck builder with content | `/pokemon` | A | — | form / social | 50 |

### 5c. Flip / "how to buy" content sites (angle A / D / C)

| # | domain | page | why relevant | PDF target | angle | evidence | route | score |
|---|---|---|---|---|---|---|---|---:|
| 14 | raidertraders.com | `/flip-pokemon-cards/` | "how to find underpriced Pokémon cards on eBay" — **exact topical match** for the tool | `/` + `/deals/under-25` | A / D | article about the exact use case | editor / form | 70 |
| 15 | ubuyfirst.com | `/pokemon-cards-on-ebay/` | eBay alert tool with a blog on flipping Pokémon | `/` | A / C | writes about eBay deal-hunting tooling | form | 58 |
| 16 | zikanalytics.com | `/blog/how-to-sell-pokemon-cards-on-ebay/` | large eBay-research SaaS blog; Pokémon buying/selling content | `/market-data/...` | C | big blog, cites data & tools | editor / PR inbox | 62 |
| 17 | cardszn.com | `/blog/sell-pokemon-cards-ebay-safely/` | Pokémon-selling blog | `/methodology` + `/` | D / A | how-to content on eBay | editor | 52 |
| 18 | underpricedai.com | `/blog/pokemon-cards-value-guide-...` | "underpriced" framing — same thesis as PDF | `/` | E / C | value-guide content | form | 54 |

### 5d. Market-analysis / stats sites (angle C — data citation)

| # | domain | page | why relevant | PDF target | angle | evidence | route | score |
|---|---|---|---|---|---|---|---|---:|
| 19 | pokemonwizard.com | `/stats` | publishes market-trend stats; a distribution stat complements theirs | `/market-data/...` | C | publishes its own citable stat pages | form | 58 |
| 20 | poke-stocks.net | market pages (verify) | Pokémon "stock market" style price index | `/market-data/...` | C | numbers-first site | form / social | 48 |
| 21 | tcgindex.io | `/pokemon` | market index + top cards | `/market-data/...` | C | index/stat site | form | 48 |
| 22 | cardvalue.app | `/pokemon-card-price-trends` | "this week's movers" content | `/best-finds` | C | recurring market content | form | 46 |
| 23 | guardiantcg.app | `/market/pokemon/report` | weekly movers report | `/best-finds` | C | recurring report format | form | 46 |
| 24 | pokemonpricetracker.com | `/blog/tag/market-analysis`, `/blog/posts/pokemon-card-slabs-psa-vs-cgc-vs-bgs-2026-guide` | **the site's own reference-price source**; runs a real blog | `/guides/pokemon-card-grading-scale` (grading) | D / C | active blog, grading + market posts | editor (existing data relationship) | 75 |

### 5e. Grading blogs (angle D — cite the grading cluster)

| # | domain | page | why relevant | PDF target | angle | evidence | route | score |
|---|---|---|---|---|---|---|---|---:|
| 25 | tcgrader.com | `/blog/is-your-pokemon-card-worth-grading-2026` | "data-backed" grading decision content | `/guides/how-to-check-pokemon-card-condition` | D | grading-decision article | form | 60 |
| 26 | cardrake.com | `/guides/grading` | grading comparison guide | `/guides/pokemon-card-grading-scale` | D | grading guide with outbound refs likely | form | 56 |
| 27 | carddeckr.com | `/blog/pokemon-tcg-grading-guide-2026-...` | grading worth-it guide | `/guides/how-to-check-pokemon-card-condition` | D | grading guide | form | 52 |
| 28 | tcgcardscan.com | `/blog/pokemon-card-grading-guide/` | grading explainer (TCGLens) | `/guides/pokemon-card-grading-scale` | D | grading guide | form | 50 |
| 29 | pregradecards.com | `/blog/pokemon-card-grading-cost-worth-it-2026` | grading cost-vs-value | `/guides/how-to-check-pokemon-card-condition` | D | grading-decision blog | form | 50 |

### 5f. Newsletters / creators (angle C / F — record only; see §11)

| # | handle / domain | where | why relevant | angle | route | score |
|---|---|---|---|---|---|---:|
| 30 | Pokemon Investor | `substack.com/@pokemoninvestor` | Pokémon-investing newsletter — could cite a weekly deal/data blurb | C / F | social / Substack DM | 58 |
| 31 | "Pokemon Market Monday" (YouTube) | channel about page | weekly investing/market news show; resource description slot | C / F | YouTube about-page email | 50 |
| 32 | Delightful TCG (as creator) | newsletter / socials | see #2 — also a content creator | C / F | form | 55 |

### 5g. Directories & tool lists — editorial vs low-value

| # | domain | verdict | note |
|---|---|---|---|
| 33 | Elite Fourum / PokéBeach threads (#8, #9) | **EDITORIAL** | human-curated, community-vetted — pursue via §5b |
| 34 | delightfultcg / packz / tcginvest roundups (#1–3) | **EDITORIAL** | ranked, maintained, link out |
| 35 | pokemonpricing.com "best price guide websites" | **[REJECTED] LOW-VALUE** | **[VERIFIED]** despite the title it links **only to itself** — a self-referential SEO/data site, not a roundup. Will not link out; it's a competitor doing SEO. |
| 36 | generic "SaaS directory" / "startup tools" sites | **[REJECTED] LOW-VALUE** | no topical relevance, no editorial vetting, often paid |
| 37 | "submit your tool" list-farms | **[REJECTED]** | paid or auto-approve; spam-risk band 15 |

### 5h. Rejected outright — [REJECTED]

- Any "guest post / sponsored post — $X" Pokémon or collectibles blog.
- Comment sections, profile-link sites, Web 2.0 properties.
- `pokemondealsfinder.com`, `pokemondeal.com` — competitors / confusable
  brands, not link prospects.
- Reddit as a *link source* (see §10 — participation only, no link-drop).

---

## 6. Top 20 — tiered by expected value

Ranked by (score × landing-probability), not by site size.

### Tier A — high relevance, realistically attainable (pursue first)

| rank | prospect | # | angle | PDF target | one-line reason |
|---|---|---|---|---|---|
| 1 | **delightfultcg.com** — tool roundups | 2 | E | `/` (deal-finding category) | ranks p1 for tool roundups, links out, missing the "find deals" category entirely |
| 2 | **packz.io** — best price-checker posts | 1 | E | `/` | already a DRAFT; the exact roundup, exact gap; just needs a contact + send |
| 3 | **raidertraders.com** — "find underpriced cards on eBay" | 14 | A/D | `/deals/under-25` | article *is* the use case; a natural single-sentence tool mention |
| 4 | **pokemonpricetracker.com** — blog | 24 | D/C | `/guides/pokemon-card-grading-scale` | existing data relationship (reference-price source); active grading + market blog |
| 5 | **pokebeach.com** — resources thread | 9 | A/D | `/` + `/guides/*` | top-tier hobby authority; the thread is a link list; join + contribute |
| 6 | **tcginvest.io** — best tools list | 3 | E/C | `/` + `/market-data/...` | "tested/updated" list format; deal-finding is an untested category for them |
| 7 | **tcgrader.com** — "worth grading" (data-backed) | 25 | D | `/guides/how-to-check-pokemon-card-condition` | their thesis needs an inspection resource; ours is neutral + free |
| 8 | **elitefourum.com** — resources thread | 8 | D | `/guides/card-condition-grading` | verified: takes suggestions; our guide fits the "Guides" section |

### Tier B — good, but slower / needs a stronger hook

| rank | prospect | # | angle | note |
|---|---|---|---|---|
| 9 | rarecandy.com | 4 | A/D | scanner app + blog; editor contact needed |
| 10 | zikanalytics.com | 16 | C | big blog; needs a genuinely novel data figure (digital-PR concept #1/#2) |
| 11 | doubleholo.com | 5 | E | "pro guide" format; single mention feasible |
| 12 | justinbasil.com | 10 | D | respected hub; slow, exacting maintainer |
| 13 | cardrake.com | 26 | D | grading guide; verify it links out |
| 14 | pokemonwizard.com | 19 | C | stats site; data-complement pitch |
| 15 | ubuyfirst.com | 15 | A/C | eBay-alert tool blog; adjacent audience |
| 16 | pokecottage.com | 11 | A | reference site; verify a links page |

### Tier C — light touch / revisit after the domain has some age

| rank | prospect | # | angle | note |
|---|---|---|---|---|
| 17 | carddeckr.com | 27 | D | grading blog |
| 18 | tcgcardscan.com | 28 | D | grading blog |
| 19 | underpricedai.com | 18 | E/C | same thesis; small |
| 20 | cardszn.com | 17 | D/A | selling-focused blog |

---

## 7. Existing outreach system — audit (§9)

**[VERIFIED]** `scripts/outreach.mjs` + `lib/outreach/{core,provider,render}.js`
+ `lib/outreach/records.json` (4 records, all DRAFT/APPROVED, **0 sent** —
provider returned 401, never configured).

**Preserved guarantees, confirmed still intact:**

| guarantee | mechanism | verified |
|---|---|---|
| no automatic sending | local CLI only; no API, no cron, no queue worker | ✓ (`core.js` header + no route) |
| approval gate | `DRAFT → approve → APPROVED` before any send; `canApprove` | ✓ |
| duplicate prevention | `alreadyContacted` blocks same `recipient` + `targetPage` in QUEUED/SENT/REPLIED | ✓ |
| daily cap | `submissionsInWindow ≥ DEFAULT_DAILY_CAP (5)` — a ceiling, counts at QUEUE time so unsent leads can't bypass it | ✓ |
| provider-sync truthfulness | `SENT` set **only** by `applySyncResult` on real Instantly send evidence; a lead-accepted is `QUEUED`, not `SENT` | ✓ |
| owner transparency | `ownershipLanguageOk` rejects "I'm a user of…"; requires "I run/built PokemonDealFinder" | ✓ |
| suppression | `suppression.json` + `isSuppressed` on domain or address | ✓ |
| non-email channels | `MEDIUM_RESPONSE`, `X_DM` tracked but never touch the mail provider (`SENDABLE_CONTACT_TYPES = ["EMAIL"]`) | ✓ — covers forum replies / X DMs cleanly |

**Can it represent SEO/link prospects?** **Yes — the existing record
shape already fits**, with no code change:

| backlink concept | existing field |
|---|---|
| prospect's page | `targetPage` |
| PDF page we want linked | `destinationUrl` |
| outreach angle (A–F) | `angle` (free string) |
| where/how the contact was found + verification | `contactSourceUrl` + `contactSourceNote` |
| channel | `contactType` (EMAIL / MEDIUM_RESPONSE / X_DM) |
| data-pitch numbers, frozen | `snapshot` (already built, `SNAPSHOT_KEYS`) |
| notes | `note` |

**Proposed OPTIONAL additive fields — [INFERENCE], NOT implemented this
phase.** `records.json` is a plain array with **no runtime schema
enforcement** (`core.js` line 32: *"The record shape … not enforced at
runtime"*), and **none of the pure gates read these**, so adding them
later is zero-risk and zero-architecture:

- `prospectType` — `tool_roundup | resource_list | grading_blog | flip_howto | market_analysis | newsletter | creator | community_thread` (currently overloaded onto `angle`).
- `score` (0–100 from §3) and `tier` (`A|B|C`).
- `evidenceUrl` — a page proving they link to comparable resources.
- Link-outcome block: `linkAcquired` (bool) · `linkUrl` · `linkTargetUrl` · `linkFirstSeen` (date) · `linkRel` (`dofollow|nofollow|ugc|unknown`).

Recommendation: add these to the **documented shape comment** in
`core.js` (and one column to `outreach:list`) *only when the first
backlink DRAFT is created* — not now. No new module, no new command.

---

## 8. Outreach copy — draft templates

All ≤ ~130 words, plain, one specific reason, value stated for **their**
audience, no flattery, no begging, ownership stated (passes
`ownershipLanguageOk`). Placeholders in `{{ }}` are the §9 fields; a
data pitch's `{{under25Pct}}` etc. are frozen from
`/market-data/pokemon-card-value-distribution` at approve time.

### T1 — Tool-roundup gap (angle E) — for #1, #2, #3, #6

> Subject: A missing category in your Pokémon price-tool roundup
>
> I run PokemonDealFinder ({{recommended_pokemondealfinder_url}}), a free
> tool that compares live eBay Pokémon listings against recent market
> references and surfaces the ones priced below market.
>
> Your post "{{page_title}}" covers the valuation side well —
> {{existing_resource}}. The step it doesn't cover is finding listings
> that are *currently* under market. That's the one thing those tools
> don't do.
>
> If you ever widen the piece to include that category, it might be
> useful to readers. Either way, no follow-up from me.

### T2 — How-to article, single mention (angle A/D) — for #14, #4, #5

> Subject: Re: {{page_title}}
>
> I built PokemonDealFinder ({{recommended_pokemondealfinder_url}}) — it
> scans live eBay Pokémon listings for ones priced below a market
> reference, which is the manual step your piece describes
> ({{why_relevant}}).
>
> Not asking for a rewrite — just flagging it in case it's a useful
> pointer for readers doing this by hand. Happy to answer anything about
> how the reference price is set ({{recommended_pokemondealfinder_url}}/methodology).

### T3 — Data citation (angle C) — for #16, #19, #24, market sites

> Subject: A Pokémon price-distribution figure you're welcome to cite
>
> I run PokemonDealFinder. From our current analysed catalogue of
> {{population}} priced English Pokémon cards (snapshot {{snapshotDate}}):
> {{under5Pct}}% are under $5, {{under25Pct}}% under $25, and
> {{over100Pct}}% are $100+, with a median raw reference of ${{median}}.
>
> If a distribution stat is ever useful for a piece on the market, that
> page is public and dated:
> {{recommended_pokemondealfinder_url}}/market-data/pokemon-card-value-distribution.
> Use it or not — just offering a citable number.

### T4 — Grading-cluster citation (angle D) — for #7, #25–29, #8

> Subject: A neutral card-inspection reference for {{page_title}}
>
> I run PokemonDealFinder. We published a plain, no-affiliate walkthrough
> of checking a raw card's condition — centering, corners, edges, surface
> — before deciding to grade:
> {{recommended_pokemondealfinder_url}}/guides/how-to-check-pokemon-card-condition.
>
> It's written to complement "is it worth grading" pieces like yours
> rather than compete with a grader's own copy. If it's a useful pointer
> for that section, great; if not, no worries.

### T5 — Community-thread contribution (angle A/D, channel MEDIUM_RESPONSE) — for #9, #8

> (posted in-thread as a member, not emailed)
>
> Adding one for the list: PokemonDealFinder
> ({{recommended_pokemondealfinder_url}}) — free, compares live eBay
> Pokémon listings to recent market references and shows the below-market
> ones. Disclosure: I built it. Also has grading/condition guides
> ({{recommended_pokemondealfinder_url}}/guides).

---

## 9. Personalization fields (deterministic; every factual one from evidence)

| field | source rule |
|---|---|
| `contact_name` | a real named person on the site's about/author page — **never invented**; if none, address the site generically and use a `form` route |
| `site_name` | the site's own masthead name |
| `page_title` | the exact `<title>` / H1 of `page_url`, copied |
| `page_url` | the specific page, verified 200 this session or at draft time |
| `existing_resource` | the actual tools/sources that page already names (quoted from it) |
| `why_relevant` | one sentence tying *their* page to the PDF asset — must be checkable against the page |
| `recommended_pokemondealfinder_url` | from the §5 table's "PDF target" column |
| `specific_value` | what their readers get (e.g. "the below-market filter their roundup is missing") |
| `outreach_angle` | one of A–F |

**Rule:** Claude may compose sentence structure and tone, but every
**factual** token (`contact_name`, `page_title`, `existing_resource`,
`why_relevant`, any stat) must originate from a page actually read at
draft time or from `/market-data/...` via the `snapshot` freeze. No
inferred facts about a prospect ever go in a message.

---

## 10. Reddit — research only, DO NOT POST (§13)

**[VERIFIED]** subreddit *rules* are not reliably web-indexed; the
classification below is **[INFERENCE]** from well-established community
norms and must be re-checked against each subreddit's own rules + a
mod modmail **before any participation**.

| community | approx focus | self-promo stance | classification |
|---|---|---|---|
| r/PokemonTCG | general TCG | blogspam / self-promo removed; no tool-drops outside designated threads | **CONDITIONAL** — answer questions helpfully; mention the tool only inside a genuine answer, with disclosure |
| r/PokeInvesting | market / investing | strict; "no advertising your site/tool" is typical | **DO NOT PROMOTE** without explicit mod permission; lurk + contribute analysis first |
| r/PokemonTCGDeals / r/PkmnTCGDeals / r/PokemonTCGDealsAndDrops | deal posts | deal links OK **per rules**; affiliate params and "my own site" often restricted | **CONDITIONAL** — only genuine, non-affiliate deal posts that follow each sub's format; never a "check out my site" post |
| r/PokemonCardValue | "what's it worth" Q&A | tool mentions tolerated when they directly answer | **CONDITIONAL** — link a specific `/cards/[slug]` only as a real answer |
| r/PokemonTCGCollections, r/pokemongrading | collections / grading | Q&A / show-and-tell | **CONDITIONAL** — grading-guide link only as a genuine reply |
| r/pkmntcgtrades | trades only | no tools | **DO NOT PROMOTE** |

**Strategy (future phase, not now):** build a real account, contribute
useful analysis and answers for weeks with **zero** links, then mention
the tool only where it is the honest best answer, always with "I built
it". No link dumping, ever.

---

## 11. Social / creator opportunities (record only — no contact) (§14)

| creator / outlet | where | collaboration angle (potential, unpitched) |
|---|---|---|
| Pokemon Investor (Substack) | `substack.com/@pokemoninvestor` | a recurring "biggest verified below-market deals this week" data blurb they could run with attribution |
| "Pokemon Market Monday" (YouTube) | weekly market show | a 20-second "deal of the week" segment fed by `/best-finds`, credited |
| Delightful TCG | blog + socials | co-reference: their tracking content ↔ our deal-finding; a shared "how to actually buy under market" piece |
| a mid-size Pokémon-collecting YouTuber with a **resource description / linktree** | (identify 3–5 at pitch time) | tool listed in the video description's resources block |

**Do not** pay, DM, or contact anyone this phase. These are notes for a
later creator-outreach phase.

---

## 12. Digital-PR concepts — recurring, from real internal data only (§16)

Every claim below is generable from data the site already has
(`deals`, `discount_pct`, `card_set`, `listing_type`, `card_catalog`,
price history, `/market-data/...`). **No sensational or fabricated
figure.** Ranked by cite-worthiness.

| rank | story | source data | cadence | who cites it |
|---|---|---|---|---|
| 1 | **Pokémon card price distribution** ("X% of priced cards are under $25; median $Y") | `/market-data/pokemon-card-value-distribution` (~29k cards) | quarterly refresh | market-analysis sites, "value" articles (#16, #19, #24) |
| 2 | **Which sets have the most below-market listings right now** | active `deals` grouped by `card_set` | weekly | deal/collecting blogs, newsletters |
| 3 | **Biggest verified below-market deals this week** (with the market-reference basis shown) | `deals` filtered `displayable`, top `discount_pct`, `/methodology` as the "how" | weekly | newsletters (#30), YouTubers (#31) |
| 4 | **Raw vs graded price gap, by card** | graded deal references vs raw `market_price` for the same printing | monthly | grading blogs (#25–29), "is it worth grading" pieces |
| 5 | **Auctions vs Buy-It-Now: where the discounts actually are** | `listing_type` split across active `deals` | monthly / one-off | eBay-buying / flipping blogs (#14–16) |

**Guardrails:** always publish the sample size and snapshot date; never
imply investment advice; label market-reference figures as references,
not guaranteed values (same rule as the guides and `/methodology`).

---

## 13. Quick-win analysis (§17)

### Top 5 **easiest** legitimate links

| # | prospect | why it's easy |
|---|---|---|
| 1 | **packz.io** (#1) | already researched + a DRAFT record exists; a real content gap; just needs a verified contact and one send |
| 2 | **delightfultcg.com** (#2) | multiple ranking roundups that link out, retailer with a real editorial process and a contact form; deal-finding is a category they simply don't have |
| 3 | **raidertraders.com** (#14) | the article is literally "how to find underpriced cards on eBay" — a one-sentence tool mention is a natural fit, low ask |
| 4 | **pokebeach.com resources thread** (#9) | member post to an existing link-list thread; no gatekeeper email, just genuine contribution + disclosure |
| 5 | **elitefourum.com resources thread** (#8) | verified to accept reader-suggested resources; our grading guide fits an existing section |

### Top 5 **highest-value realistic** links

| # | prospect | why it's high value |
|---|---|---|
| 1 | **pokebeach.com** (#9) | oldest, most-referenced Pokémon-TCG site in the hobby; a link from a PokéBeach resource page is a real trust signal, and it's attainable via member participation |
| 2 | **pokemonpricetracker.com** (#24) | the site's own reference-price source; a link from their blog is topically perfect **and** there's an existing relationship to build on |
| 3 | **delightfultcg.com** (#2) | ranks page-1 for the exact roundup queries the PDF wants to be in; a mention there is both a link *and* referral traffic from buyers |
| 4 | **tcginvest.io** (#3) | "best tools" list with real traffic; inclusion positions PDF alongside the established tools for the category-defining query |
| 5 | **tcgrader.com** (#25) | "data-backed, worth grading" content with an audience actively deciding whether to grade — the ideal reader for the grading cluster |

**[INFERENCE]** The easiest and the highest-value lists overlap on
PokéBeach and Delightful TCG — those two are the clear first moves.

---

## 14. Measurement plan (§12)

Per pursued prospect, track (in `records.json` once the additive §7
fields exist, or a sidecar sheet until then):

`prospect · contacted_at · provider status (DRAFT→…→SENT/REPLIED/FAILED) ·
reply (y/n + gist) · link_acquired (y/n) · link_url · link_target_url ·
link_first_seen · link_rel (dofollow/nofollow/ugc/unknown) · notes`

**How we'll know it worked (evidence, not vanity):**
- **Referral traffic** to the `link_target_url` in Vercel Web Analytics,
  filtered by `referrerHostname` (works for nofollow/ugc too).
- **GSC**: re-run `scripts/_gscAudit.mjs` monthly — watch for the first
  **brand query** (`pokemon deal finder`) appearing, and for the
  target pages' `lastCrawl` / coverage state improving.
- **Manual link check**: quarterly `site:` + exact-URL search for the
  domain to catch mentions we weren't told about.
- Don't over-weight nofollow: a relevant mention on PokéBeach or a
  newsletter has discovery + referral value regardless of `rel`.

**First checkpoint:** 6–8 weeks after the first send, against the
SEO-GSC-1 baseline (0 referring signals, 0 brand queries).

---

## 15. Final summary

| question | answer |
|---|---|
| verified backlink / mention footprint | **none** — 0 pages mention or link `pokemondealfinder.com`; no directory / Reddit / forum / social presence. No backlink API available to check further. |
| qualified prospects found | **~40 researched**; **20 tiered** in the pack |
| Tier A / B / C | **A: 8 · B: 8 · C: 4** |
| strongest existing linkable asset | the **card price-distribution data** (`/market-data/pokemon-card-value-distribution`) — a single citable stat set, already wired into the outreach `snapshot` freeze — closely followed by the **grading/condition guide cluster** |
| top 5 easiest | packz.io · delightfultcg.com · raidertraders.com · pokebeach.com resources thread · elitefourum.com resources thread |
| top 5 highest-value realistic | pokebeach.com · pokemonpricetracker.com blog · delightfultcg.com · tcginvest.io · tcgrader.com |
| existing outreach tooling supports this? | **Yes, with no code change.** Existing record shape covers it; 4 optional leaf fields (`prospectType`, `score`/`tier`, `evidenceUrl`, a `linkAcquired` block) are *proposed* for when the first backlink DRAFT is created — not built now. All send-safety gates untouched. |
| best outreach angle | **E — "the deal-finding category your price-tool roundup is missing"** (unique, honest, editor-friendly), with **C — data citation** as the scalable second |
| Reddit / community verdict | **Participation-first, no link-drops.** Most relevant subs are CONDITIONAL; r/PokeInvesting and r/pkmntcgtrades are DO-NOT-PROMOTE. Build an account and contribute for weeks before any tool mention. |
| best digital-PR concept | the **quarterly Pokémon card price-distribution report** (#1) — genuinely citable, already a live dated page, zero fabrication risk |
| architecture change required | **none** |
| next recommended action | verify a contact for **packz.io** and **delightfultcg.com**, draft T1 for each as `DRAFT` records, and (separately) create a member account on **PokéBeach** to begin genuine participation. Keep the daily cap at its default; send nothing until each draft is reviewed. |

**No outreach was sent. No directory submitted. No Reddit post. No DM. No
account created. This phase ends here.**
