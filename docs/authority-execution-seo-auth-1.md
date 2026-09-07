# SEO-AUTH-1 — Authority / backlink execution plan

**Date:** 2026-09-07 · **Status:** EXECUTION PLAN. Builds on the SEO-GSC-4
research pack (`docs/authority-backlink-audit.md`) and the SEO-GSC-5
Batch-1 records. **This phase sent nothing new.** The two cold emails
already in flight (packz, pokemonpricetracker) remain `QUEUED` at
Instantly with no send evidence yet — see §9 for why no new batch was
queued.

No code changes. Existing outreach system + record shape are sufficient.

---

## 1. Outreach status (re-synced 2026-09-07 from Instantly)

| Prospect | Record | Route | Status | Notes |
|---|---|---|---|---|
| **Packz** | `packz` | EMAIL `support@packz.io` | **QUEUED** | Lead submitted to Instantly 2026-09-06; `leadStatusRaw=1`, no send evidence on 2026-09-07 sync. Not yet SENT. |
| **Pokemon Price Tracker** | `pokemonpricetracker` | EMAIL `pokepricetracker@proton.me` | **QUEUED** | Lead submitted 2026-09-06; same — queued, not sent. Existing reference-price relationship. |
| **Delightful TCG** | `delightfultcg` | WEB_FORM | **NOT_CONTACTED** | DRAFT. Contact form only — a human pastes it; never touches the mail provider. |
| **Raider Traders** | `raidertraders` | X_DM `@raidertradershq` | **NOT_CONTACTED** | DRAFT. Reviewer note on the record: they run their own "Flip Score" deal rankings — weigh competitor overlap before contacting. |
| **Pokemon Wizard** | `pokemonwizard` | WEB_FORM | **NOT_CONTACTED** | DRAFT. Data-citation pitch; live figures must be frozen before submit. |
| **PokeBeach** | — | community thread | **COMMUNITY_ONLY** | No editorial cold-contact route. Member participation is the only legitimate path (§11). Not an outreach record. |
| **Elite Fourum** | — | community thread | **COMMUNITY_ONLY** | Same. Resources thread accepts member-suggested links after genuine participation. |
| Voxbooster | `voxbooster` | EMAIL `contact@voxbooster.com` | **NOT_CONTACTED** | DRAFT. Body still has `{{snapshot}}` placeholders; not review-passed. |
| Stephen Leonard (Medium) | `stephen-leonard` | MEDIUM_RESPONSE | **NOT_CONTACTED** | DRAFT. Manual in-thread reply only. |
| Cardrake | `cardrake` | X_DM `@cardrakeapp` | **NOT_CONTACTED** | DRAFT. Manual DM only. |

Nothing is `SENT`, `REPLIED`, `WON`, `DECLINED`, or `NO_RESPONSE`. The two
`QUEUED` records are the furthest along; everything else is `DRAFT`.

---

## 2. Top linkable assets — scored, and the two to push hardest

Score 1–5 per factor (5 = best).

| Asset | Linkability | Uniqueness | Data value | Editorial value | Updateability | **Total** |
|---|---:|---:|---:|---:|---:|---:|
| **A. `/market-data/pokemon-card-value-distribution`** | 5 | 5 | 5 | 4 | 4 | **23** |
| **B. Grading / condition cluster** (`/guides/card-condition-grading` + `/guides/pokemon-card-grading-scale` + `/guides/how-to-check-pokemon-card-condition`) | 4 | 3 | 3 | 5 | 3 | **18** |
| C. The tool itself (`/`, `/deals/under-25`, `/best-finds`) | 3 | 5 | 2 | 2 | 5 | 17 |
| D. `/methodology` | 2 | 3 | 3 | 3 | 2 | 13 (supporting only) |
| E. `/cards/[slug]` / `/pokemon/[slug]` / `/sets/[slug]` | 3 | 2 | 3 | 2 | 5 | 15 (deep-link targets, not campaign assets) |

**Push hardest: A (the value-distribution data) and B (the grading
cluster).** A is a single citable stat set writers quote directly; B is
evergreen, no-affiliate-pressure reference content that fits "is it worth
grading" articles that already exist in volume.

---

## 3. Prospect queue (ranked)

Full research + evidence is in `docs/authority-backlink-audit.md` §5–§6.
This is the executable queue — 28 rows, junk directories excluded.

Legend — **Route:** `email` / `form` / `x_dm` / `forum` (member) /
`medium` · **Diff:** E(asy) / M(edium) / H(ard).

### Tier A — pursue first

| # | Domain | Contact route | Fit | Target asset | Angle | Priority | Diff | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | packz.io | email `support@packz.io` | best-price-checker roundup, no deal-finding entry | `/` | Resource gap (E) | A1 | E | QUEUED |
| 2 | delightfultcg.com | form `/pages/contact` | ranks p1 for tracking-app roundups, links out, no deal category | `/deals/under-25` | Resource gap (E) | A2 | M | DRAFT |
| 3 | raidertraders.com | x_dm `@raidertradershq` | "how to find underpriced cards on eBay" — exact use case | `/deals/under-25` | Tool discovery (A) | A3 | M | DRAFT (competitor overlap — review) |
| 4 | pokemonpricetracker.com | email `pokepricetracker@proton.me` | active grading + market blog; our reference-price source | `/guides/pokemon-card-grading-scale` | Guide citation (D) | A4 | M | QUEUED |
| 5 | pokebeach.com | forum (resources thread) | top-tier hobby authority since 2003; thread is a link list | `/` + `/guides/*` | Community (A/D) | A5 | H | COMMUNITY_ONLY |
| 6 | elitefourum.com | forum (`/t/…/49904`) | maintained resources thread, takes member suggestions | `/guides/card-condition-grading` | Community (D) | A6 | H | COMMUNITY_ONLY |
| 7 | rarecandy.com | email (editor) | "check value fast & free" — slot for a deal-finding tool | `/cards` + `/` | Tool discovery (A/D) | A7 | M | not researched (contact) |
| 8 | doubleholo.com | email (editor) | "pro guide to finding value" — deal discovery is the missing step | `/` | Resource gap (E) | A8 | M | not started |

### Tier B — good, slower, needs a stronger hook

| # | Domain | Route | Fit | Target | Angle | Pri | Diff | Status |
|---|---|---|---|---|---|---|---|---|
| 9 | zikanalytics.com | email / PR inbox | large eBay-research SaaS blog; Pokémon buying content | `/market-data/…` | Data citation (C) | B1 | H | not started |
| 10 | pokemonwizard.com | form `/contact` | self-published market stats page | `/market-data/…` | Data citation (C) | B2 | M | DRAFT |
| 11 | justinbasil.com | form / editor | respected free TCG resource hub | `/guides/*` | Guide citation (D) | B3 | H | not started |
| 12 | cardrake.com | x_dm `@cardrakeapp` | grading comparison guide | `/guides/pokemon-card-grading-scale` | Guide citation (D) | B4 | M | DRAFT |
| 13 | ubuyfirst.com | form | eBay-alert tool with a flipping blog | `/` | Tool discovery (A/C) | B5 | M | not started |
| 14 | pokecottage.com | form | collector reference site, likely a links page | `/sets` + `/pokemon` | Resource list (A) | B6 | M | not verified |
| 15 | cardvalue.app | form | "this week's movers" content | `/best-finds` | Data citation (C) | B7 | M | not started |
| 16 | voxbooster.com | email `contact@voxbooster.com` | trading-card statistics roundup | `/market-data/…` | Data citation (C) | B8 | M | DRAFT (needs snapshot freeze) |
| 17 | medium.com/@steveleonard11 | medium (in-thread reply) | "free tools I use to buy cheap cards" article | `/` + `/market-data/…` | Tool workflow | B9 | E | DRAFT (manual) |

### Tier C — light touch / revisit once the domain has age

| # | Domain | Route | Target | Angle | Status |
|---|---|---|---|---|---|
| 18 | tcgrader.com | form | `/guides/how-to-check-pokemon-card-condition` | Guide (D) | **HELD** — see §4 (full competing grading cluster; revisit only with a data angle) |
| 19 | carddeckr.com | form | `/guides/how-to-check-pokemon-card-condition` | Guide (D) | not started |
| 20 | tcgcardscan.com | form | `/guides/pokemon-card-grading-scale` | Guide (D) | not started |
| 21 | pregradecards.com | form | `/guides/how-to-check-pokemon-card-condition` | Guide (D) | not started |
| 22 | underpricedai.com | form | `/` | Resource gap (E/C) | not started |
| 23 | cardszn.com | email (editor) | `/methodology` + `/` | Guide/Resource (D/A) | not started |
| 24 | tcgcollector.com | form | `/sets` | Resource list (A) | verify a links page exists |
| 25 | pkmn.gg | form / social | `/pokemon` | Resource list (A) | verify a links page exists |
| 26 | poke-stocks.net | form / social | `/market-data/…` | Data citation (C) | not started |
| 27 | tcgindex.io | form | `/market-data/…` | Data citation (C) | not started |
| 28 | Pokemon Investor (Substack) | Substack DM | `/best-finds` weekly blurb | Data (C/F) | record-only (creator phase) |

---

## 4. Removed / held prospects (with reason)

| Domain | Verdict | Reason |
|---|---|---|
| **tcgrader.com** | **HELD** (was Tier A in SEO-GSC-4) | 2026-09-07 re-verification found a full competing grading-content cluster ("What each grade 1–10 means", "Grade at home", "Centering vs corners vs edges vs surface"). No truthful citation gap for our grading pages. Revisit only with a data-citation angle. |
| **tcginvest.io** | **REMOVED** (was Tier A) | Runs its own below-market / "deal" tooling — a direct competitor. The "the category your roundup is missing" angle is not truthful here. |
| **rarecandy.com** | **DOWNGRADED to A7 with a data angle only** | Closed ecosystem; promotes only its own first-party tools, no editorial outbound-link history. |
| **pokemonpricing.com** "best price guide websites" | **REJECTED — low value** | Despite the title it links only to itself. A competitor doing SEO, not a roundup; will not link out. |
| Generic SaaS / "startup tools" / "submit your tool" directories | **REJECTED** | No topical relevance, no editorial vetting, usually paid or auto-approve. Spam-risk band. |
| Any "guest post — $X" / "sponsored post" collectibles blog | **REJECTED** | Paid placement. Policy: never buy links. |
| Comment sections, profile-link sites, Web 2.0 properties | **REJECTED** | Manipulative, no editorial value. |
| `pokemondealsfinder.com`, `pokemondeal.com` | **REJECTED** | Confusable competitor brands, not link prospects. Always use the full URL `pokemondealfinder.com` in copy to avoid conflation. |
| Reddit as a *link source* | **REJECTED for link-dropping** | Participation only — see §11. |

---

## 5. Linkable data brief — "How Pokemon card values actually break down"

*Every figure below is live from `/market-data/pokemon-card-value-distribution`,
snapshot **7 September 2026**. Numbers move with each catalogue sync;
freeze them into a record `snapshot` before any pitch is sent.*

**Headline:** Most catalogued Pokemon cards are worth only a few dollars —
just **5.2%** carry a raw reference of $100 or more.

**Key findings** (n = **21,775** priced, English, non-specialty cards; **211**
sets; **1,025** Pokemon):

1. **65%** of analysed cards have a raw market reference **under $5** (14,156 cards).
2. **84.4%** are **under $25** (adds the 4,227 cards in the $5–$25 band).
3. **10.4%** fall between **$25 and $100** (2,260 cards).
4. **5.2%** are **$100 or more** (1,132 cards).
5. **Median raw market reference: $1.61 USD.**

**Methodology (short):** English cards in our catalogue that are
individually identifiable, imaged, have a stable id, and a usable
non-placeholder raw market reference. Excludes oversized/Jumbo and World
Championship deck reprints. Each surviving card is placed in one raw-value
band by its reference; the median is over the same set. References come
from PokemonPriceTracker. Raw = ungraded; a reference is an estimate, not
a guaranteed price.

**Data freshness:** the page is pinned to a stated snapshot date (the
newest catalogue sync), not its publish date, so the figures stay
quotable. Refreshed roughly quarterly.

**Stat-friendly summary (drop-in):**
> Of ~21,800 priced English Pokemon cards analysed by Pokemon Deal Finder
> (snapshot 7 Sep 2026), 65% have a raw value under $5, 84% under $25, and
> only 5% reach $100+. Median raw value: $1.61.
> Source: pokemondealfinder.com/market-data/pokemon-card-value-distribution

**Target audiences:** market-analysis / "TCG statistics" writers;
"what is my card worth" explainer authors; collecting newsletters;
grading blogs (as context for "which cards are worth grading").

---

## 6. Digital-PR angles (5) — only what the dataset supports

| # | Angle | Source data | Cadence | Likely to cite |
|---|---|---|---|---|
| 1 | **Pokemon card price distribution** — "X% of priced cards are under $25; median $Y" | `/market-data/pokemon-card-value-distribution` | quarterly | market-analysis sites, "value" explainers |
| 2 | **Which sets have the most below-market listings right now** | active `deals` grouped by `card_set` | weekly | deal / collecting blogs, newsletters |
| 3 | **Biggest verified below-market deals this week**, with the market-reference basis shown | `deals` (displayable), top `discount_pct`, `/methodology` as the "how" | weekly | newsletters, YouTube market shows |
| 4 | **Raw vs graded price gap, by card** | graded deal references vs raw `market_price` for the same printing | monthly | grading blogs, "is it worth grading" pieces |
| 5 | **Auctions vs Buy-It-Now: where the discounts actually are** | `listing_type` split across active `deals` | one-off / monthly | eBay-buying / flipping blogs |

**Chosen lead angle: #1** — it is already a live, dated, methodology-backed
page; zero fabrication risk; the format editors cite. #2 is the scalable
weekly follow-up once #1 has earned its first citations.

**Guardrails (all angles):** always publish sample size + snapshot date;
never imply investment advice; label market references as references, not
guaranteed values.

---

## 7. Outreach copy — 5 role variants

80–140 words. One asset, one reader reason, soft ask, ownership stated in
the first sentence (passes `ownershipLanguageOk`). No "link exchange", no
flattery, no SEO jargon. Placeholders `{{like_this}}` are filled from the
prospect's actual page at draft time; data figures are frozen from the
snapshot at approve time.

### 7a. EDITOR (tool-roundup gap — angle E)
> Subject: A category missing from "{{page_title}}"
>
> I run PokemonDealFinder (pokemondealfinder.com), a free tool that
> compares live eBay Pokemon listings to recent market references and
> surfaces the ones priced below market.
>
> Your roundup covers the valuation side well — {{tools_it_names}}. The
> one thing none of those do is find listings that are *currently* under
> market. If you ever widen the piece to include that, it may be useful
> to your readers. No follow-up from me either way.

### 7b. RESOURCE-PAGE OWNER (curated links list — angle A)
> Subject: One for the {{page_title}} list
>
> I run PokemonDealFinder (pokemondealfinder.com). Your resource list is
> the kind of page it belongs on: it's a free tool that scans live eBay
> Pokemon listings and shows the ones priced below a recent market
> reference — including an under-$25 view at
> pokemondealfinder.com/deals/under-25.
>
> If it fits a slot on the list, great; if not, no problem. Happy to
> answer anything about how the reference price is set.

### 7c. TOOL / PRICE TRACKER (data citation — angle C)
> Subject: A Pokemon price-distribution figure you're welcome to cite
>
> I run PokemonDealFinder. From our analysed catalogue of {{population}}
> priced English Pokemon cards (snapshot {{snapshotDate}}): {{under5Pct}}%
> are under $5, {{under25Pct}}% under $25, and only {{over100Pct}}% reach
> $100+, with a median raw reference of ${{median}}.
>
> If a distribution stat is ever useful for a market write-up, the page
> is public and dated:
> pokemondealfinder.com/market-data/pokemon-card-value-distribution. Use
> it or not — just offering a citable number, no ask attached.

### 7d. GRADING SITE (guide citation — angle D)
> Subject: A neutral card-inspection reference for "{{page_title}}"
>
> I run PokemonDealFinder. We published a plain, no-signup walkthrough of
> checking a raw card's condition — centering, corners, edges, surface —
> before deciding whether to grade:
> pokemondealfinder.com/guides/how-to-check-pokemon-card-condition.
>
> It's written to sit alongside "is it worth grading" pieces like yours,
> not compete with a grader's own copy. If it's a useful pointer for that
> section, it's there. Either way, useful article.

### 7e. BLOGGER (how-to article, single mention — angle A/D)
> Subject: Re: {{page_title}}
>
> I built PokemonDealFinder (pokemondealfinder.com) — it runs the exact
> scan your piece describes ({{manual_step}}) continuously and surfaces
> the below-market listings.
>
> Not asking for a rewrite — just flagging it in case it's a useful
> pointer for readers doing this by hand. Happy to explain how the
> reference price is set (pokemondealfinder.com/methodology).

---

## 8. Anchor-text policy

We control almost no anchors (they belong to the linking site), but every
pitch, resource-list submission, forum post and data brief that *suggests*
link text follows this:

**Prefer** (natural, branded, descriptive):
- `PokemonDealFinder` / `Pokemon Deal Finder`
- the bare URL `pokemondealfinder.com`
- `Pokemon card value distribution`
- `Pokemon card grading guide` / `how to check a card's condition`
- `Pokemon deal finder` (generic descriptive)

**Avoid:**
- exact-match commercial anchors: `best Pokemon card deals`, `cheap Pokemon cards`, `Pokemon card deals`
- keyword-stuffed or repetitive anchors across multiple placements
- anything that reads as optimised rather than as how a person would refer to the site

**Rule of thumb:** if the anchor wouldn't appear naturally in a sentence a
human wrote about the tool, don't suggest it. A spread of branded + URL +
plain-descriptive anchors across a handful of relevant domains is the goal
— never the same optimised phrase twice.

Always write the full URL `pokemondealfinder.com` (name-collision with
`pokemondealsfinder.com` / `pokemondeal.com`).

---

## 9. Next send batch — **HELD. Nothing queued.**

**Decision: queue nothing this cycle.** Reasons:

1. **Two real cold emails are already in flight and unconfirmed.** `packz`
   and `pokemonpricetracker` were submitted to Instantly on 2026-09-06 and
   both still read `QUEUED` (`leadStatusRaw=1`, no send evidence) on the
   2026-09-07 sync. Stacking a third real send from a warming mailbox
   before the first two are confirmed sent is poor deliverability hygiene.
2. **24h submission window: 2 / 5 used** — headroom exists but is not the
   constraint; #1 is.
3. **No email DRAFT is send-ready.** The only sendable (`EMAIL`) DRAFT is
   `voxbooster`, whose body still carries unresolved `{{snapshot}}`
   placeholders and has not had a human-review pass.
4. **The best next targets are non-email.** `delightfultcg` (form),
   `raidertraders` (X DM), `pokemonwizard` (form) can never go through the
   send pipeline (`SENDABLE_CONTACT_TYPES = ["EMAIL"]`) — they require a
   human to paste the pitch after review.

**Ranked next 3 (for the owner to action when the in-flight batch resolves):**

| Rank | Prospect | Route | Action needed before send |
|---|---|---|---|
| 1 | **delightfultcg.com** | contact form | Human pastes the `delightfultcg` DRAFT text into `/pages/contact` after a review read. Highest audience value (p1 roundup + buyer referral traffic). |
| 2 | **raidertraders.com** | X DM `@raidertradershq` | Human review of the competitor-overlap note on the record, then send the DRAFT DM manually. Exact-use-case article. |
| 3 | **voxbooster.com** | email | Freeze the value-distribution snapshot into the record (`approve` does this), human-review the resolved body, then `approve` + `send`. Only after packz/PPT show `SENT`. |

Do not exceed **3–5 new touches per rolling week** while the domain and
mailbox are new.

---

## 10. Follow-up policy

- **One** follow-up per prospect, **7–10 days** after the initial send,
  only if there has been no reply.
- The follow-up is two sentences: a one-line reminder of the specific
  resource + "no worries if it's not a fit — I won't chase further."
- **No second follow-up.** After one unanswered follow-up the record moves
  to `NO_RESPONSE` and is not contacted again on the same asset.
- If they reply at any point → mark `REPLIED`, handle by hand, stop the
  automated follow-up.
- Community threads (§11) have **no** follow-up — you either contributed
  usefully or you didn't.

---

## 11. Community strategy (separate from cold outreach — no automation)

For **PokeBeach**, **Elite Fourum**, and relevant subreddits
(r/PokemonTCG, r/PokemonCardValue, r/PokemonTCGDeals):

- **Participation first.** Register a real account, answer questions and
  join set / price / grading discussions for **several weeks with zero
  links**.
- Mention the tool **only** where it is the honest best answer to
  someone's actual question, and **always disclose ownership** ("I built
  it").
- Contribute **data**, not links: a genuinely useful figure or a
  screenshot of a real current deal, with the source page named.
- Suggest a resource for a curated thread (PokeBeach / Elite Fourum
  resources threads) only *after* being an established contributor, and
  disclose ownership in the post. Lead with the **grading guide** for
  Elite Fourum (it fits their "Guides" section); the deal finder is a
  stretch there.
- **Never** drop a link cold, never post "check out my site", never use
  automation. r/PokeInvesting and r/pkmntcgtrades: **do not promote** at
  all without explicit mod permission.

This workflow is human and account-based. It produces **no**
`records.json` entries.

---

## 12. On-site asset audit — no P1 changes needed

Both top-2 assets were checked live (2026-09-07) against the link-earning
checklist. **Everything is already in place; no code change is warranted.**

**`/market-data/pokemon-card-value-distribution`:**

| Check | State |
|---|---|
| Dated snapshot, pinned (not publish date) | ✅ `<time dateTime>` + "snapshot 7 Sept 2026", explained |
| Methodology section + link to `/methodology` | ✅ dedicated "How this analysis was calculated" section |
| Source named | ✅ PokemonPriceTracker credited |
| Key-findings block (stat-friendly) | ✅ 6 bullet findings with counts |
| Chart with visible text values, no JS library | ✅ + a text summary line + "Pokemon Deal Finder · pokemondealfinder.com · snapshot {date}" caption |
| Embed-/quote-friendly table | ✅ HTML `<table>` of bands, %s, counts |
| **Citation guidance** | ✅ dedicated "Citing this analysis" section with a ready-made citation string and "a link back is appreciated but not required" |
| Definitions (raw / reference / specialty) | ✅ "What the terms mean" section |
| Internal links to hubs | ✅ (see §13) |

**Grading cluster** (`/guides/card-condition-grading`,
`/guides/pokemon-card-grading-scale`,
`/guides/how-to-check-pokemon-card-condition`): each is self-canonical,
carries `Article` + `FAQPage` schema with `datePublished`/`dateModified`,
deterministic tables (grade scale, inspection axes), and rich sibling +
hub internal linking. No affiliate pressure in the body. **Link-ready.**

Deliberately **not** added: `Dataset` / `Product` / `Offer` schema on the
market-data page — the market-data test contract forbids it, and it isn't
needed to earn citations.

---

## 13. Internal authority flow — already healthy

Both assets already pass authority inward with contextual links (no footer
spam). Verified live 2026-09-07:

- **Value-distribution page** links in body/related to: `/cards`,
  `/deals`, `/sets`, `/pokemon`, `/guides`, `/methodology`.
- **Each grading guide** links to: `/cards`, `/deals`, `/sets`,
  `/pokemon`, `/guides`, `/methodology`, plus the sibling guides.
- Site-wide: the SEO-GSC-2 footer "Browse" row (`/deals /cards /pokemon
  /sets /guides`) is on every page.

No change needed. When a link is earned, its target page already
distributes that authority to the core hubs.

---

## 14. Measurement baseline (set today, 2026-09-07)

**Baseline (from SEO-GSC-1 + this session):**

| Metric | Value at baseline |
|---|---|
| Referring domains (any tool / GSC links report) | **0** (no backlink API; `"pokemondealfinder.com"` exact search = 0 mentions) |
| Brand queries in GSC (`pokemon deal finder`) | **0** |
| Sitemap URLs submitted / errors | 26,308 / 0 |
| Pages with GSC impressions | ~261 (SEO-GSC-1) |
| Indexed pages | near-0 confirmed; most `/cards` `/pokemon` `/sets` = "Discovered / URL unknown" |
| `/market-data/pokemon-card-value-distribution` coverage | not yet crawled |
| Grading cluster coverage | `/guides/card-condition-grading` crawled 2026-08-28; scale + how-to pages new |

**Track monthly** (re-run `scripts/_gscAudit.mjs`; check Vercel Web
Analytics `referrerHostname`):

- new **referring domains** (manual `site:` + exact-URL search quarterly, plus any we're told about)
- **linked target pages** and their `rel` (dofollow / nofollow / ugc)
- **referral sessions** to each `link_target_url` (works for nofollow too)
- **GSC impressions** for the target pages + first appearance of a **brand query**
- **indexed-page count** growth and `lastCrawl` recency on target pages
- queries/pages that gain after a confirmed win — **correlation only, no causal claims**

**First checkpoint:** 6–8 weeks after `packz` / `pokemonpricetracker`
show `SENT`.

---

## 15. Success definition (next 30–45 days)

**5–10 relevant referring domains** — quality and topical fit over count.
A single link from PokeBeach, Delightful TCG, or PokemonPriceTracker's
blog is worth more than dozens of low-relevance links. Not a target: raw
link volume, directory submissions, or anything requiring payment or
automation.

---

## 16. Record-keeping rules (unchanged, restated)

Every send (email or manual) records, on the `records.json` entry:
`prospect · targetPage · destinationUrl · subject · sentAt · providerRef ·
status · followUpAt · repliedAt · note`, plus the outcome block
(`linkAcquired` · `linkUrl` · `linkTargetUrl` · `linkFirstSeen` ·
`linkRel`) once known.

- **No duplicate outreach:** `alreadyContacted` blocks the same
  `recipient` + `targetPage` in QUEUED/SENT/REPLIED.
- Manual (form / DM / forum) touches get a record with the paste target
  and date, even though they never touch the mail provider.
- `SENT` is set **only** by a real Instantly send-evidence sync — never by
  hand.
- Suppression list (`suppression.json`) is honoured on domain + address.
