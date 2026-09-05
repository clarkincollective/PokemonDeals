# PokemonPriceTracker Social/Data Rights Clarification Pack — Phase 13D.3

**Status: documentation + outreach-preparation only.** No message has been
sent to PokemonPriceTracker ("PPT"). No eBay contact occurred. No social
platform was connected. No content was published. No runtime code was
changed. This pack exists so the **owner** can send (or not send) the
request, on their own timing, once they're ready.

This is the companion rights document to
[`docs/social-compliance-readiness.md`](./social-compliance-readiness.md)
(13D.1, §6) and [`docs/social-creative-system.md`](./social-creative-system.md)
(13D.2) — it resolves the one open dependency those two docs both flagged
as **REQUIRES PROVIDER CONFIRMATION**.

---

## 1. Re-audited PPT terms (2026-09-05, first-party source)

Source: `https://www.pokemonpricetracker.com/terms`, Section numbers as
published on the page.

| Topic | Exact clause (quoted) | Permits | Prohibits | Classification |
|---|---|---|---|---|
| Commercial use | §6: "Using PokePriceTracker Data for any commercial purpose requires an active Business or Enterprise subscription." | Commercial use on the held Business plan | Commercial use without a paid plan | **CLEARLY ALLOWED** (website use, already covered) |
| Raw resale/redistribution | §6: "you may not resell, sublicense, syndicate, or redistribute the raw data itself as a standalone product or data service" | — | Reselling/syndicating raw data as its own product | **CLEARLY PROHIBITED** |
| Competing API / bulk export | §6: "Use our API to power your own competing API..." / "Create and sell bulk datasets, data feeds, or database exports sourced from our API" | — | A competing API, bulk datasets, data feeds, exports | **CLEARLY PROHIBITED** |
| Caching within your own app | §6: "You may store and cache PokePriceTracker Data in your own systems and serve it to the end users of your own application" | Caching + serving to *your own application's* end users | Bulk retrieval anticipating cancellation | **CLEARLY ALLOWED** (for the website) |
| Cache freshness | §6: "Cached data should be refreshed on a reasonable schedule so that end users are not shown materially stale pricing." | — | Serving materially stale cached data indefinitely | **CLEARLY ALLOWED, with a condition** |
| Off-site / social-media display | *(no clause found)* | — | — | **AMBIGUOUS — REQUIRES WRITTEN CONFIRMATION** |
| Card image usage | *(no clause found)* — §9 only notes PPT doesn't own Pokemon trademarks | — | — | **AMBIGUOUS — REQUIRES WRITTEN CONFIRMATION** |
| Attribution | *(no clause found)* | — | — | **AMBIGUOUS — REQUIRES WRITTEN CONFIRMATION** (default to none required, but don't assume) |
| Automated/programmatic use | §5: normal API rate-limit/auth rules; §8 prohibits scraping/data-mining without consent | Ordinary authenticated API use within plan limits | Scraping outside the API | **CLEARLY ALLOWED for API use; AMBIGUOUS for "automated social rendering" specifically** |
| Social platform mentions | *(none)* | — | — | **AMBIGUOUS** |

**Nothing is inferred where the terms are silent.** Off-site display, card
images, attribution, and automated social rendering are each a genuine gap
in the current terms, not a "probably fine" reading of them — hence this
outreach.

---

## 2. Exact social use cases (question table)

| # | Use case | Example | Exact question to ask |
|---|---|---|---|
| A | Market reference display | "Market reference: $121" | Can PokemonDealFinder publish a single derived market-reference value (already licensed for on-site display) in a social graphic/caption? |
| B | Percentage movement | "30-day movement: +18%" | Can PokemonDealFinder calculate and publish a derived percentage change computed from PPT history, off-site? |
| C | Price-history chart | Simple 30-day line | Can a derived chart image (rendered by us, no raw data rows exposed) be published off-site? |
| D | Raw vs graded | Raw $80 / PSA 9 $140 / PSA 10 $360 | Can two or more separate derived reference values be shown side-by-side in one social post? |
| E | Grade spread | PSA 10 premium vs raw | Can a derived ratio/spread calculation be published? |
| F | Weekly market movers | "Top 5 cards by 7-day movement" | Can a small ranked list built from derived movement data (not the underlying dataset) be published? |
| G | Set/Pokemon market snapshot | Aggregate stats across N cards | Is aggregated, multi-card derived display allowed off-site? |
| H | Automated deterministic template generation | Code fills numbers into a static image, no GenAI | Does generating this content via deterministic code (vs. a human typing it) change what's permitted? |
| I | Card imagery (if supplied by PPT) | Any PPT-hosted card image/URL | See §9 below — asked as its own, most detailed section. |

---

## 3. What we are explicitly NOT asking for

The request states plainly that PokemonDealFinder is **not** seeking
permission to:

- Resell PPT data
- Redistribute raw database records
- Publish bulk exports
- Expose API responses publicly
- Expose full price-history datasets
- Create a competing pricing API or data feed
- Sublicense PPT data to any third party
- Provide downloadable raw data to anyone

We are asking only for permission to display **derived, limited,
public-facing content** that explains Pokemon-card market information to
collectors — a strict subset of what the existing Business-plan license
already covers for on-site use, extended to one additional surface
(social media) with no change to data volume or redistribution model.

---

## 4. Raw vs. derived — the boundary used in the request

| RAW (not requested) | DERIVED (what we're asking about) |
|---|---|
| Entire historical row sets | One current market reference for one card |
| Full API payloads | A single computed percentage/dollar change |
| Bulk pricing tables | A raw-vs-graded spread for one card |
| Downloadable exports | A simple chart rendered to a static image (no data table alongside it) |
| Complete data mirrors | A ranked list of a small number of cards by a computed metric |
| — | Aggregate statistics across one set/species (counts, ranges) |

This exact table is included in the outreach so PPT can answer against a
concrete, unambiguous line rather than a vague "can we use your data
socially" question.

---

## 5. Data-volume boundary (as stated in the request)

- A small, bounded number of cards per post (single digits — never a
  bulk listing).
- No public API exposure of any kind.
- No raw, downloadable, or bulk data of any kind.
- No standing "feed" of PPT data to any third party.
- The request is scoped to *display*, not *distribution* — this is
  restated explicitly so the ask reads as narrow and reasonable, not a
  request for broad republication rights.

---

## 6. Automation boundary (as stated in the request)

Future social content may be **generated automatically from structured
data using deterministic templates** — code selects and formats already-
derived numbers into a static image; no natural-language generation, no
GenAI, and no live provider API response is ever exposed publicly. No
card data is supplied to any third party beyond what the derived figure
itself already discloses. A human may still review the final post before
it publishes (consistent with the Level-B-only automation model already
adopted for the whole social program — see 13D.1/13D.2). PPT is asked
directly whether *automating* the generation of already-permitted
derived content changes their permission requirements, since the terms
don't currently distinguish "a person types this number into Canva" from
"code renders this number into an image."

---

## 7. GenAI — deliberately kept separate and optional

The primary request covers **deterministic template generation only** —
this is not currently needed for anything GenAI-related, and PPT data is
never intended to reach an LLM under the current design (13D.2 §29's
structured-payload architecture explicitly excludes this). The draft
includes one clearly-labeled **optional** question:

> "If we later considered using an AI provider to assist with caption
> wording or layout (not to process your underlying data, only to help
> phrase already-derived figures), would that require separate written
> approval from PokemonPriceTracker?"

Framed explicitly as hypothetical and not-currently-planned, so it can't
be read as an announcement of an existing GenAI integration.

---

## 8. Attribution — asked, not assumed

The request asks PPT to state their own requirement, offering the
concrete options so they can just point at one:

- "Data: PokemonPriceTracker" (or similar) in the caption
- Their logo in the creative
- A link to their site
- No attribution required
- Some other specific wording they'd prefer

No attribution rule is invented or assumed in the meantime — the current
terms have no attribution clause at all, so the honest default is "we
don't know," not "probably none needed."

---

## 9. Image rights — the most important section

The request asks, specifically and separately from every other question:

1. Does PPT itself hold licensable rights to any card images it supplies
   (via API or website), or are those images sourced from elsewhere
   (e.g. TCGplayer, a card-scan partner) such that PPT cannot grant
   off-site usage rights for them?
2. If PPT does hold usable rights: may such an image be embedded in a
   branded social graphic (not shown standalone/unmodified)?
3. May it be resized or cropped for a template layout?
4. May it be cached temporarily (see §10) specifically for the purpose
   of rendering a queued or already-published social asset?

**If PPT does not own/control the image rights, the request explicitly
asks them to say so plainly** — so PokemonDealFinder does not have to
infer non-permission from silence, and doesn't seek or imply a transfer
of rights PPT doesn't possess. This is deliberately the most detailed
section of the ask, since it's the highest-risk of the open questions
(13D.1 flagged the same open question independently for eBay-sourced
images; this closes the equivalent gap for PPT-sourced ones).

---

## 10. Caching / retention — asked explicitly, not assumed from the website rule

The existing §6 caching clause ("cache and serve to end users of your own
application... refreshed on a reasonable schedule") was written for the
**website**, not for a queued social-rendering pipeline where a draft
image might sit for human review before publishing. The request asks
specifically:

- May price/historical data be cached temporarily for the purpose of
  rendering a social asset?
- May a card image (if usage is separately approved per §9) be cached
  for the same purpose?
- Is there a maximum queue/retention time before the underlying figures
  must be refreshed or the draft discarded as stale?
- Does the existing "reasonable schedule" refresh expectation apply
  as-is, or does PPT have a different (likely shorter) expectation for
  content destined for public, unlisted-duration social posts?

---

## 11. Platform scope

The request asks about **Instagram and TikTok only** — the two platforms
actually in scope per 13D.1/13D.2 — rather than asking for blanket
"social media" rights across every possible platform. Kept deliberately
narrow; X/Facebook/YouTube Shorts are not mentioned, consistent with "do
not overcomplicate the request."

---

## 12. Commercial context (disclosed plainly)

The draft states plainly: PokemonDealFinder is an independent Pokemon
card deal-discovery and market-reference website; social posts would aim
to drive users back to the site, and the site itself carries affiliate
commercial context (eBay Partner Network / TCGPlayer). The draft does
**not** imply or suggest that PokemonPriceTracker endorses
PokemonDealFinder in any way — it's presented as a straightforward
customer-to-provider licensing question, not a partnership pitch.

---

## 13. Full email draft (~340 words) — NOT SENT

> **Subject: Quick licensing question — social media use of derived PokemonPriceTracker data (Business plan customer)**
>
> Hi PokemonPriceTracker team,
>
> I run PokemonDealFinder (pokemondealfinder.com), an independent Pokemon
> card deal-discovery and market-reference site. We're a Business-plan
> subscriber and use your API for market-reference pricing, grade-specific
> sold-comp data, and price history, all displayed on our own site under
> our current license.
>
> We're evaluating a future Instagram/TikTok presence and want to confirm,
> in writing, whether our existing license covers a few **derived,
> off-site** uses before we build anything. To be clear up front, we are
> **not** asking to resell your data, redistribute raw records or bulk
> exports, expose API responses, or build a competing pricing feed — only
> to display small, individually-computed figures publicly, the same way
> we already do on our own site.
>
> Specifically, could you confirm whether our license permits, off-site
> on Instagram/TikTok:
>
> 1. A single derived market-reference value for one card
> 2. A derived percentage/dollar change computed from your price history
> 3. A simple chart we render ourselves from that history (no raw data shown)
> 4. A side-by-side raw-vs-graded comparison for one card
> 5. A small ranked list (a handful of cards) built from derived movement data
> 6. Aggregate statistics across one set or Pokemon species
>
> A few more specific questions:
>
> - **Card images**: do you hold rights to any card images you supply, and
>   if so, may they be embedded (resized/cropped) into a branded social
>   graphic? If you don't hold those rights, could you let us know so we
>   don't assume otherwise?
> - **Automation**: the content above would be generated by our own code
>   from already-derived numbers (no AI, no raw data exposed) — does that
>   change anything versus a person typing the same number into a design
>   tool?
> - **Attribution**: is any specific credit/link required in posts using
>   your data?
> - **Caching**: may we briefly cache figures/images for a queued post
>   awaiting human review before publishing, and is there a retention
>   limit you'd want us to follow?
>
> Nothing above is live yet — we wanted your confirmation before building
> it. Happy to hop on a call if that's easier. Thanks for your time!
>
> [Owner name]
> PokemonDealFinder — [account email]

---

## 14. Shorter support-form / Discord version (~120 words) — NOT SENT

> Hi — Business-plan subscriber here (PokemonDealFinder). Quick licensing
> question before we build anything: does our license cover using
> **derived** figures (not raw data — no exports, no API exposure, no
> resale) in Instagram/TikTok posts? Specifically: (1) one market
> reference per post, (2) a % change we compute from your history, (3) a
> chart we render ourselves, (4) a raw-vs-graded comparison, (5) a small
> ranked list of a few cards, (6) set/Pokemon aggregate stats — all
> auto-generated by our own code from already-derived numbers, no AI, no
> raw data shown. Also: do you hold rights to any card images you supply
> for this kind of use, is attribution required, and can we briefly cache
> a figure/image for a post queued for review? Thanks!

---

## 15. Response matrix (to be filled in when PPT replies)

| Permission | Asked? | Response | Status | Impact |
|---|---|---|---|---|
| Market reference (single value, off-site) | Yes | *pending* | *pending* | Gates Deal-adjacent PPT-figure use |
| Percentage change | Yes | *pending* | *pending* | Gates Market Movers, Market Snapshot |
| Price-history chart | Yes | *pending* | *pending* | Gates Market Snapshot, Price History |
| Raw vs graded comparison | Yes | *pending* | *pending* | Gates Raw vs Graded template family |
| Grade spread / ratio | Yes | *pending* | *pending* | Gates Grade Spread (Ladder) template family |
| Weekly market movers (ranked list) | Yes | *pending* | *pending* | Gates Weekly Market Movers, Biggest Losers |
| Set/Pokemon aggregate snapshot | Yes | *pending* | *pending* | Gates Set/Pokemon Spotlight's PPT-figure elements |
| Automated deterministic rendering | Yes | *pending* | *pending* | Gates whether §6/§20 automation targets are usable at all |
| Card images (rights ownership) | Yes | *pending* | *pending* | Gates Mode A for any PPT-sourced image |
| Image transformation (crop/resize/composite) | Yes | *pending* | *pending* | Refines Mode A even if base rights confirmed |
| Temporary caching for queued/review content | Yes | *pending* | *pending* | Governs how the Level-B human-review queue may hold drafts |
| Attribution requirement | Yes | *pending* | *pending* | Feeds directly into the caption schema (13D.2 §20) |
| GenAI future use (optional, hypothetical) | Yes (optional) | *pending* | *pending* | Informational only — not required to proceed with the deterministic MVP |

---

## 16. Decision outcomes

### FULL APPROVAL
Unlocks: Weekly Market Movers, Biggest Losers, Raw vs Graded, Grade
Spread (Ladder), Price History / Market Snapshot, and PPT-sourced
imagery in social graphics (Mode A becomes available). The 13D.2 Tier 2
pillars move to buildable status.

### DERIVED DATA APPROVED, IMAGES NOT APPROVED (or images are PPT-doesn't-hold-rights)
Every derived-figure format above is buildable, but **only in Mode B/C**
(13D.2 §9) — no PPT-supplied card image is used. This is the most likely
practical middle outcome and does not block launch of the Tier-1/Tier-2
pillars; it only shapes their visual mode.

### WEBSITE-ONLY (no off-site derived use approved)
No PPT-derived figures appear in social content of any kind. The social
MVP remains limited to the rights-clear pillars already identified in
13D.2 §31 (Deal of the Day, Best Deals Found Today, Just Found, Pokemon
Spotlight, Set Spotlight) — all of which are live-eBay-deal-driven, not
PPT-figure-driven, and therefore entirely unaffected by a website-only
answer.

### UNCLEAR / PARTIAL / NON-RESPONSE
Silence or ambiguity is **never** read as permission. One narrow,
specific follow-up question is sent (not a re-send of the full request)
targeting exactly the unclear point. Until resolved, that specific use
case stays in the WEBSITE-ONLY bucket for social purposes.

---

## 17. Compliance boundaries carried forward, unchanged

- No message was sent this phase — the owner sends it (or not) on their
  own timing, through whatever channel they judge appropriate (email vs.
  support form/Discord, both drafted above).
- No eBay contact occurred, no AI Tools application was touched or
  discussed with eBay, and nothing here disturbs the current EPN Quality
  review.
- No social platform was connected; no content was published; no
  runtime/rendering code was written.
- This pack does not change the 13D.2 MVP recommendation (Deal of the
  Day, Best Deals Found Today, Just Found, Pokemon Spotlight, Set
  Spotlight) — none of those five depend on PPT's answer, since they're
  built entirely from live eBay-deal data already covered by 13D.1's
  eBay-side analysis.

---

## Recommendation for next phase

Send the email or support-form draft above (owner's choice, owner's
timing — not automated). Once a response arrives, fill in §15's matrix
and apply §16's outcome logic — that's a short, mechanical follow-up
task, not a new design phase. Independently of PPT's answer, the
technical-spike recommendation from 13D.2 §"Recommendation for next
phase" (a narrow Level-A pipeline for the five rights-clear MVP families)
remains available to start now, since it has no dependency on this
document's outcome.
