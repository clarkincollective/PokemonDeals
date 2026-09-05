# Social Creative System & Template Blueprint — Phase 13D.2

**Status: design/specification only.** No code changed, nothing published,
no platform connected. This is the companion design document to
[`docs/social-compliance-readiness.md`](./social-compliance-readiness.md)
(Phase 13D.1), which this document assumes and does not re-litigate — the
compliance boundaries there (no eBay data into GenAI pre-approval, no
composited eBay images pre-confirmation, human-approval-gated publishing,
no full auto-publish) are load-bearing constraints on everything below,
referenced inline as **[13D.1: ...]**.

---

## 1. Reference content model — PriceCharting & Collectr (patterns only)

Analyzed from the owner's supplied reference screenshots and each account's
publicly visible presentation style. No content was scraped at scale; no
artwork, layout, typography, caption text, or exact slide order is
reproduced anywhere in this document or intended for future use.

### Hook patterns observed
Biggest movers (up/down), "exploding" cards, weekly recap/leaderboard
framing, expensive/rare-card spotlighting, grade-spread reveals ("raw vs
PSA 10"), anomaly framing ("this shouldn't be worth more than that one").

### Information density (conceptual, not measured)
Low text density per slide — one headline, one hero number, one card image
dominate; supporting data (timeframe, source) is small and secondary.
Percentage or dollar figures are the single largest visual element after
the card art. Captions are short; the creative itself carries the story.

### Visual hierarchy (typical order of attention)
1. Card image / hero visual
2. Large numeric hook (% or $)
3. Card name / identifying text
4. Supporting context (timeframe, "raw" vs "graded" label)
5. Branding / CTA (smallest, most consistent element — build recognition
   through repetition, not size)

### Carousel flow (typical shape)
Slide 1 hooks with a single number or question and minimal clutter; middle
slides each carry exactly one card/comparison; a final slide closes with a
recap or a follow/visit prompt. Rarely more than 7-8 slides — swipe fatigue
sets in past that.

### Format mix
Static single-image posts for one strong fact; carousels for
ranked/multi-card content; short video for reveal-style content (price
counting up, grade comparison). Chart posts are less common than card-image
posts in this niche — the card itself is the recognizable, desirable
object, not the abstract number.

### Psychology at work
**Recognition** (a known card catches the eye faster than a headline does),
**status/collectability** (seeing a card you own — or want — climb in
value), **nostalgia** (vintage/childhood sets), **ranking completion** (an
implicit "did my card make the list" pull), **financial curiosity** (a
concrete number is more shareable than a vague claim), **surprise** (a gap
big enough to be counter-intuitive). None of this requires manufactured
urgency, fake scarcity, or a countdown — the psychology is native to
collecting and market curiosity, not manipulation.

---

## 2. PokemonDealFinder's own social identity

**Positioning:** *Pokemon card market intelligence focused on
opportunities collectors can actually act on.*

Where a generic market-tracking account's implicit promise is "watch the
market," PokemonDealFinder's is "here's what to do about it right now" —
every post should be traceable to real, currently-checkable evidence on
the site, not just an interesting fact. This is the structural
differentiator: PriceCharting/Collectr-style accounts are observational;
PokemonDealFinder is actionable, because a live-verified deal or a current
auction sits behind almost everything it posts.

**Recurring editorial threads** (a small, consistent vocabulary — building
brand recognition without needing a logo watermark to work):

| Thread | Meaning |
|---|---|
| FOUND | A specific live deal our scan surfaced |
| UNDER MARKET | A listing priced below its market reference, framed on the gap itself |
| JUST LISTED | Recency-led — "this is new," not "this is discounted" |
| MARKET MOVE | A price-history observation, historical only, never predictive |
| RAW VS GRADED | The reference-spread education/finding format |
| AUCTION WATCH | Live-auction content, always bid-can-rise framed |
| SET WATCH | One set's current opportunity landscape |
| POKEMON WATCH | One species across prints/sets |

Spelling: **Pokemon**, never accented "Pokémon," in every public-facing
asset — captions, on-image text, alt text — matching the site's existing
house style.

**Visual identity anchor:** extends the existing site brand (red/white,
magnifying-glass mark, clean sans-serif) rather than inventing a new one —
no Poké Ball, no official Pokemon Company typography or logo treatment, no
imitation of PriceCharting's or Collectr's specific palette/type choices.

---

## 3. Content pillar prioritization

Scored against: likely engagement, differentiation from reference accounts,
data reliability, automation suitability, rights risk, EPN dependency,
collector usefulness, and likelihood of driving a site visit/QCA.

### TIER 1 — strongest fit, build first
| Pillar | Why Tier 1 |
|---|---|
| **Best Deals Found Today** | Directly showcases the core product; fully live data; highest QCA-likelihood; automatable end-to-end (candidate selection) |
| **Deal of the Day** | Same strength, lower production cost (1 card, not 5) — a good MVP starting format |
| **Just Found** | Recency itself is the hook; reuses the exact freshness/discovery-age contract already built for the homepage "Just Added" lane (P0.2) |
| **Raw vs Graded** | Highly differentiating (few accounts make this the headline), strong "surprise" psychology, data already exists (PPT grade-specific references) |
| **Pokemon Spotlight** | Reuses `/pokemon/[slug]` — a real, already-indexed landing destination; strong search-intent alignment |
| **Set Spotlight** | Same strength, reuses `/sets/[slug]` |

### TIER 2 — strong, needs one dependency resolved first
| Pillar | Dependency |
|---|---|
| **Weekly Market Movers** | Needs the meaningful-value floor defined in §13, and PPT off-site confirmation **[13D.1 §6]** |
| **Biggest Losers** | Same as above — historical-observation framing must stay strictly non-predictive (§14 truth contract) |
| **Grade Spread** | PPT provider confirmation for off-site derived-figure display **[13D.1 §6]** |
| **What $X Can Buy** | Fully live-data-driven and Tier-1-strong on merit; held to Tier 2 only because it needs a card image or template treatment resolved first (image-rights mode, §9) to avoid looking like a spreadsheet |
| **Auction Watch** | Data-ready today; Tier 2 only because auction wording carries the highest truth-contract risk (§12) and deserves the review checklist (§28) proven on Tier-1 formats first |
| **Newly Listed Watch** | Overlaps heavily with Just Found; worth testing as a variant, not a separate launch pillar |

### TIER 3 — valuable later, not a launch priority
| Pillar | Why deferred |
|---|---|
| **Price History (7d/30d/90d/1y)** | Needs a chart-rendering system (§10) built and PPT confirmation; highest production cost of any pillar |
| **Market Anomaly** | Needs the meaningful-value floor (§13) proven first via Market Movers; higher risk of looking sensationalized if the floor isn't right |
| **Collection Education** | Valuable for trust-building but doesn't map to a specific live data point — best as an occasional format, not a recurring pillar, and doesn't drive the same QCA path |

---

## 4. Ten reusable template families

All ten assume **structured-template generation, not GenAI processing of
eBay data**, per the compliance boundary. "Automation difficulty" and
"human review requirement" describe the *target* state once Level B
(automated draft + human approval) is built — nothing here is implemented.

### 1. BEST DEALS FOUND TODAY
- **Purpose:** showcase 3-5 live verified deals in one post.
- **Format:** carousel.
- **Data required:** N deals passing `isPremiumDealEligible` (exact-verified, fresh), each with card name/set, listing price, market reference, discount %, verification age.
- **Slide count:** 2 + N (hook, one per deal, close) — capped at 7 total.
- **Hook formula:** "[N] Pokemon cards we found under market today."
- **Body structure:** one deal per slide — card art (mode-dependent, §9), price vs. reference, %, verified-time stamp.
- **Data hierarchy:** % below market → listing price → market reference → verified time.
- **CTA:** "See today's live deals →."
- **Freshness requirement:** every featured deal re-checked for `is_active` immediately before render (mirrors the site's own render-time gate — never a synchronous eBay call, always from already-verified stored state).
- **Rights dependency:** card image mode (§9).
- **Automation difficulty:** Low (candidate selection is fully deterministic, reuses existing ranking).
- **Human review:** Medium — reviewer checks all N deals still look right, not just one.

### 2. DEAL OF THE DAY
- **Purpose:** one standout verified BIN deal, lowest production cost.
- **Format:** single static image (or 2-slide: hook + evidence).
- **Data required:** one flagship-eligible deal.
- **Slide count:** 1-2.
- **Hook formula:** "Found today: [Card]."
- **Body structure:** price vs. reference, %, saved $, verified time.
- **Data hierarchy:** card → % below market → $ price → $ reference.
- **CTA:** "Check today's deal →."
- **Freshness requirement:** same render-time re-check as #1.
- **Rights dependency:** card image mode.
- **Automation difficulty:** Lowest of all ten families — ideal MVP candidate.
- **Human review:** Low (~15s, one deal to check).

### 3. JUST FOUND
- **Purpose:** recency-led single discovery.
- **Format:** single static or short reel-style reveal.
- **Data required:** a deal within the Just-Added discovery-age window (reuses the homepage's own `JUST_ADDED_MAX_DISCOVERY_AGE_HOURS` contract) that is also exact-verified.
- **Slide count:** 1.
- **Hook formula:** "Just found: [Card] — [X]% below market."
- **Body structure:** discovery-age framing front and center ("found [N] minutes/hours ago"), price/reference secondary.
- **Data hierarchy:** recency → % → price.
- **CTA:** "See what's new →."
- **Freshness requirement:** strictest of all ten — a stale "Just Found" is the single worst trust failure this system could produce, given P0.2's whole premise.
- **Rights dependency:** card image mode.
- **Automation difficulty:** Low, contingent on Just Added's own verification throughput (P0.2) staying healthy.
- **Human review:** Low.

### 4. AUCTION WATCH
- **Purpose:** one or a few live auctions below current reference.
- **Format:** single or short carousel (2-3 auctions).
- **Data required:** live, non-ended auctions with fresh exact verification, current bid, market reference, end time.
- **Slide count:** 1-4.
- **Hook formula:** "Auction watch: [Card] — currently [X]% under reference."
- **Body structure:** current bid → reference → % → "ends in [time]" → explicit "bids can rise."
- **Data hierarchy:** current bid and end-time are co-equal top elements (§12 — never subordinate the time-sensitivity).
- **CTA:** "Watch this auction →."
- **Freshness requirement:** bid and end-time re-checked at render time; auction must not have ended.
- **Rights dependency:** card image mode.
- **Automation difficulty:** Low-Medium (wording discipline is the main risk, not the data).
- **Human review:** High — auction wording is the highest-scrutiny content type (§12).

### 5. RAW VS GRADED
- **Purpose:** spotlight the reference gap between raw and graded value for one card.
- **Format:** single image or 2-slide (reveal-style).
- **Data required:** raw reference + one or more grade-specific references (PPT), same card, same timestamp basis.
- **Slide count:** 1-2.
- **Hook formula:** "Raw vs PSA 10: the gap on [Card]."
- **Body structure:** raw figure → grade figure(s) → spread ($ and/or ratio).
- **Data hierarchy:** the spread number is the hero; raw/graded labels must be unmistakable (never implied).
- **CTA:** "See current listings for this card →" (both raw and graded, if available).
- **Freshness requirement:** reference timestamp shown; no live-listing freshness concern (this is a reference-data format, not a deal format) — see §14's raw/graded truth contract.
- **Rights dependency:** PPT provider confirmation for off-site grade-specific figures **[13D.1 §6]**; card image mode.
- **Automation difficulty:** Medium (wording must never imply grading guarantees the higher value).
- **Human review:** Medium.

### 6. GRADE SPREAD (LADDER)
- **Purpose:** show the full grade ladder for one card (raw → PSA 9 → PSA 10, etc.), not just a single comparison.
- **Format:** single image, bar/step visual.
- **Data required:** raw + all available grade references for one card.
- **Slide count:** 1.
- **Hook formula:** "The full grade ladder on [Card]."
- **Body structure:** ascending bars/steps, each labeled with grade + reference.
- **Data hierarchy:** the shape of the ladder (is it linear or does one grade spike?) is the story, not any single number.
- **CTA:** "See current listings for this card →."
- **Freshness requirement:** reference timestamp shown.
- **Rights dependency:** same as #5.
- **Automation difficulty:** Medium (chart rendering, §10).
- **Human review:** Medium.

### 7. WHAT $X CAN BUY
- **Purpose:** a curated set of live deals within one price band.
- **Format:** carousel.
- **Data required:** N live, verified deals filtered to a price band ($25/$50/$100/$250/$500).
- **Slide count:** 2 + N, capped at 7.
- **Hook formula:** "What $[X] can get you in Pokemon cards right now."
- **Body structure:** identical per-deal structure to #1, scoped by price rather than by "best."
- **Data hierarchy:** price band is the frame; % below market is still shown per card but is secondary to "this is what $X buys."
- **CTA:** "Browse this price band →" (a real filtered `/deals` destination, §25).
- **Freshness requirement:** same as #1.
- **Rights dependency:** card image mode.
- **Automation difficulty:** Low.
- **Human review:** Medium.

### 8. POKEMON SPOTLIGHT
- **Purpose:** one species across multiple prints/sets.
- **Format:** carousel.
- **Data required:** `/pokemon/[slug]` data — species-wide active deals, price range, print count.
- **Slide count:** 2 + up to 5 prints.
- **Hook formula:** "[N] [Pokemon] deals worth checking today."
- **Body structure:** hook → context (this species, this many active listings) → one print per slide → close.
- **Data hierarchy:** species name is the anchor; each print's own price/reference/% follows the standard deal structure.
- **CTA:** "See all [Pokemon] cards →" → `/pokemon/[slug]`.
- **Freshness requirement:** standard per-deal check.
- **Rights dependency:** card image mode.
- **Automation difficulty:** Low (species pages and eligibility already exist).
- **Human review:** Medium.

### 9. SET SPOTLIGHT
- **Purpose:** one set's current opportunity landscape.
- **Format:** carousel.
- **Data required:** `/sets/[slug]` data — set-wide active deals.
- **Slide count:** 2 + up to 5 deals.
- **Hook formula:** "The best deals we found in [Set] today."
- **Body structure:** identical shape to #8, scoped by set instead of species.
- **Data hierarchy:** set name/era is the anchor.
- **CTA:** "Browse [Set] →" → `/sets/[slug]`.
- **Freshness requirement:** standard.
- **Rights dependency:** card image mode.
- **Automation difficulty:** Low.
- **Human review:** Medium.

### 10. MARKET SNAPSHOT (historical observation)
- **Purpose:** a single card's market-reference movement over a defined window, strictly observational.
- **Format:** single image with a simple chart (§10).
- **Data required:** confident trend-window data (reuses the site's own `confidentTrendWindows` anomaly-suppression logic — a window is only shown when the underlying history clears that same bar the site already applies before showing a trend on-site).
- **Slide count:** 1.
- **Hook formula:** "[Card]'s market reference over the last [7/30/90] days."
- **Body structure:** start value → end value → % change → explicit window dates.
- **Data hierarchy:** the % change is the hero number; the chart is supporting evidence, not decoration.
- **CTA:** "See full price history →" → card hub.
- **Freshness requirement:** N/A (historical, not live-deal); window dates must be exact and shown.
- **Rights dependency:** PPT provider confirmation **[13D.1 §6]**.
- **Automation difficulty:** Medium (chart rendering + the anomaly gate).
- **Human review:** Medium — reviewer confirms the observation isn't being read as a forecast.

---

## 5. Carousel story architecture

```
SLIDE 1 — HOOK        one idea, one number/question, minimal clutter
SLIDE 2 — CONTEXT      (optional — see below) what's being ranked/measured
SLIDES 3–7 — CONTENT   one card/comparison per slide, identical structure
                       slide-to-slide (predictability aids swipe-through)
FINAL — ACTION         visit PokemonDealFinder / browse deals / check prices
```

**When Slide 2 (context) is unnecessary:** when the hook slide already
states the full frame unambiguously — e.g. "5 Pokemon deals we found under
market today" needs no separate context slide; "The best deals we found in
Evolving Skies today" likewise. Context slides earn their place only when
the ranking criterion itself needs a sentence to explain (e.g. a Market
Movers post should briefly state the timeframe and the meaningful-value
floor in plain language, since "moved the most" is ambiguous without it).
Default: **skip the context slide** unless the format specifically needs
it (Market Movers, Market Anomaly) — every added slide is a swipe-through
cost.

**Maximizing swipe-through without clickbait:** the hook must be a true,
checkable claim the content slides then substantiate one-for-one (never a
hook that oversells what follows); identical per-slide layout inside one
post (so the eye doesn't have to re-orient); a final slide that's a genuine
close (recap or CTA), never a slide that teases "one more thing" to force
an extra swipe.

---

## 6. Hook library (formulas, not filled captions)

Grouped by content pillar. `[ ]` marks a structured-data slot filled
deterministically at render time — never freeform LLM text pre-approval.

**DEAL**
1. "[N] Pokemon cards we found under market today."
2. "Found today: [Card]."
3. "[Card] — [X]% below market, live now."
4. "This [Card] listing is priced below our market reference."
5. "[N] Pokemon deals worth a look right now."
6. "Today's find: [Card] at [price]."
7. "A live [Card] listing under our market reference."

**JUST FOUND / RECENCY**
8. "Just found: [Card]."
9. "New in the last [N] [minutes/hours]: [Card]."
10. "Freshly discovered: [Card] — [X]% below reference."
11. "This one just showed up on our scan."

**MARKET MOVE (historical, non-predictive)**
12. "These Pokemon cards moved the most this week."
13. "[Card]'s market reference over the last [window]."
14. "The biggest [window] movers we tracked."
15. "[Card] moved [X]% over [window]."
16. "A look at how [Card] has moved."

**GRADE**
17. "The PSA 10 premium on [Card] is [X]."
18. "Raw vs PSA 10: the gap on [Card]."
19. "The full grade ladder on [Card]."
20. "What grading is worth on [Card] right now."
21. "Raw [price] → PSA 10 [price]."

**PRICE BAND**
22. "What $[X] can buy in Pokemon cards today."
23. "[N] Pokemon deals under $[X] right now."
24. "$[X] budget? Here's what's live today."

**AUCTION**
25. "Auction watch: [Card]."
26. "[N] Pokemon auctions worth watching today."
27. "Currently [X]% under reference — bidding now."
28. "This auction ends in [time]."
29. "Live auction: [Card], current bid [price]."

**SET**
30. "The best deals we found in [Set] today."
31. "[N] live deals in [Set] right now."
32. "[Set] deals worth checking today."
33. "What's live in [Set] this week."

**POKEMON**
34. "[N] [Pokemon] cards currently below market."
35. "[Pokemon] deals worth checking today."
36. "Every [Pokemon] print with a live deal."

**SURPRISE / ANOMALY**
37. "This card's raw vs PSA 10 gap is wide."
38. "An unusual gap on [Card] right now."
39. "[Card] is priced differently across grades than you'd expect."

**EDUCATIONAL**
40. "Why this $[X] raw card becomes $[Y] in PSA 10."
41. "What 'market reference' means, and why it matters."
42. "Raw vs graded, explained in one card."
43. "Current bid vs final price: why they're different."
44. "How we check a listing is still live."

**SET/POKEMON DIRECTORY**
45. "Every current deal in [Set], ranked by discount."
46. "The most-listed [Pokemon] cards right now."
47. "[Set]'s biggest deals this week."

**RECAP / CLOSE (final-slide formulas)**
48. "That's today's finds — more live at PokemonDealFinder."
49. "New deals get added continuously — check back."
50. "See all of today's live deals →."
51. "This is a snapshot — availability changes constantly."

**Explicitly avoided, every family, no exceptions:** "Buy now," "before
it's too late," "guaranteed profit/deal," "will explode," "don't miss
out," any investment-outcome promise.

---

## 7. Visual system

### Canvas (current platform-safe dimensions)
| Use | Dimensions |
|---|---|
| Feed portrait (single/carousel) | 1080×1350 (4:5) |
| Feed square (fallback) | 1080×1080 (1:1) |
| Story / Reel | 1080×1920 (9:16) |

### Grid (per slide)
```
┌─────────────────────────────┐
│ HEADER ZONE (hook/context)   │  small, top-anchored
├─────────────────────────────┤
│                               │
│      CARD-ART ZONE            │  dominant, mode-dependent (§9)
│                               │
├─────────────────────────────┤
│  PRIMARY NUMBER (huge)        │
│  secondary evidence (small)   │
├─────────────────────────────┤
│ footer: freshness · branding  │  smallest, most consistent
└─────────────────────────────┘
```

### Typography hierarchy (conceptual levels, no copyrighted font required)
1. HOOK — largest headline weight, used sparingly (slide 1 mainly)
2. PRIMARY NUMBER — the single biggest element on content slides (%, $, or spread)
3. CARD NAME — clearly legible, second-largest
4. SUPPORTING DATA — small, factual (price, reference, timeframe)
5. SOURCE/FRESHNESS — smallest body text ("verified [time]" / "[window] dates")
6. CTA/BRANDING — small, but present and consistent every single post

### Color semantics (deliberately not a trading-terminal palette)
- **Opportunity (below market / live deal):** the site's existing
  emerald/green accent, used sparingly — one number, not the whole card.
- **Movement down (historical, non-predictive):** a neutral warm tone, not
  alarm-red — this is an observation, not a loss warning.
- **Neutral information:** the site's existing zinc/gray text scale.
- **Auction:** the site's existing amber accent (already used on-site for
  "current bid" framing) — visually distinct from a flat BIN deal.
- **Graded:** a distinct neutral accent (e.g. a muted blue/slate), never
  reusing the "opportunity" green, so a grade comparison is never
  mistakable for a deal callout.

Avoid making every post green-for-up/red-for-down like a stock ticker —
this is a collectibles product, not a trading terminal; color should
support the specific claim on that slide, not create a market-wide mood.

### Branding
Small, consistent mark (the existing red magnifying-glass identity) in
the same footer position every post — recognizable through repetition and
placement, not through size or overlay dominance on the card art.

---

## 8. Information hierarchy per slide

Every content slide should let a viewer answer, in under 2 seconds:

| Question | Where it lives |
|---|---|
| What card? | Card name (typography level 3) + art (if present) |
| What happened / why interesting? | The hook framing carried from slide 1, reinforced by the primary number |
| What number matters? | Primary number (typography level 2) |
| What timeframe / market basis? | Supporting data + source/freshness line |
| What should I do next? | CTA (present on the final slide; implicit "swipe" affordance elsewhere) |

**Maximum useful data points per slide: 4** — card identity, primary
number, one supporting fact, one freshness/timeframe fact. Anything more
(seller feedback %, shipping cost, condition detail, multiple percentages)
belongs on the landing page, not the slide — that's exactly what "Deals
are the destination" means in practice: the slide sells the *idea*, the
site delivers the *detail*.

---

## 9. Card image strategy — three modes

Designed so the system works regardless of how the open rights questions
**[13D.1 §7]** resolve.

**MODE A — Licensed card image** (future, once eBay/provider image rights
are confirmed): the listing photo (or a PPT catalogue image, if licensed
for this use) fills the card-art zone, unmodified and visually isolated
per the "Public Display" caution in 13D.1 — never composited with other
non-source content in the same frame beyond our own minimal template chrome
once that specific question is separately cleared.

**MODE B — No card image** (available today, no rights dependency):
typography- and chart-driven. Card name set large and bold, primary number
dominant, a simple icon/symbol system (suit-style set icons, a generic
card-silhouette shape) fills the art zone instead of a real photo. Must
still look intentional and premium — this is the default mode until image
rights are resolved, not a degraded fallback.

**MODE C — Owner-created / rights-safe asset**: a photo the owner
personally takes of their own physical card, or an original
illustration/graphic PokemonDealFinder commissions or creates that doesn't
reproduce protected artwork (e.g. an abstract card-shaped placeholder with
a magnifying-glass motif) — usable immediately, no dependency.

**Explicitly not a mode:** AI-generated recreations of Pokemon
characters/card artwork. Per 13D.1 §22, this is not evaluated as an
option here either — Mode B or C substitute for it.

The design system (grid, typography, color) is identical across all three
modes — only the art-zone content changes, so switching modes later (once
rights resolve) requires no redesign.

---

## 10. Chart system

Formats, all phone-readable, none imitating a trading terminal:

| Chart type | Use | Requirements |
|---|---|---|
| Sparkline | A quick-glance trend indicator alongside a number | No axes/labels beyond start/end value |
| 7d / 30d comparison | Two-point comparison (start vs. now) | Just two labeled points + connecting line; exact dates shown |
| 90d / 1y line | Fuller trend for Market Snapshot posts | A handful of gridlines max; y-axis always starts at/near zero or is clearly annotated if not (never truncate silently — see below) |
| Raw vs graded bars | Grade-ladder comparison | Bars proportional to actual value (no exaggerated scale); each bar labeled with its grade and figure |

**Non-negotiable requirements (every chart):**
- Readable at phone-screen size — no dense multi-series charts.
- Clear timeframe stated on the slide, not just implied by the chart.
- Starting value and ending value both shown as text, not just implied by
  the line's shape.
- % change shown as text.
- **No misleadingly truncated y-axis** — if an axis doesn't start at zero,
  that must be visually obvious (a break mark or an explicit axis label),
  never a silent zoom that exaggerates a small move into a dramatic slope.
- Sourced from the same `confidentTrendWindows` anomaly-suppressed data
  the site itself uses — a window with unreliable/thin/conflicting
  historical evidence is never charted, matching the site's own existing
  standard rather than inventing a separate one for social.

---

## 11. Deal content structure (BIN)

| Field | Slide | Caption only | Landing page only |
|---|---|---|---|
| Card display name | ✅ | ✅ | ✅ |
| Set | ✅ | ✅ | ✅ |
| Raw / graded (+ grader/grade) | ✅ | ✅ | ✅ |
| Listing price | ✅ | ✅ | ✅ |
| Market reference | ✅ | ✅ | ✅ |
| Difference % | ✅ | ✅ | ✅ |
| Difference $ | Optional (space permitting) | ✅ | ✅ |
| Marketplace/country | Small badge only | — | ✅ |
| Verification age ("verified [time]") | ✅ (small) | ✅ | ✅ |
| Seller feedback, shipping, condition detail | — | — | ✅ |
| Raw eBay listing ID / URL | — | — | ✅ (as the outbound link only, never as visible text) |

Rule of thumb: the slide carries only what's needed for the *hook and the
number*; the caption restates it in words for accessibility/search; the
landing page carries everything else. Never crowd a slide with more than
the 4-data-point ceiling from §8.

---

## 12. Auction content structure

**Required semantics, every time, no exceptions:**
- Current bid (labeled explicitly as "current bid," never as "price")
- Market reference
- "% below reference **currently**" — the word "currently" is load-bearing
- "Ends in [time]"
- "Bids can rise" (or equivalent) stated plainly, not buried in fine print

**Never:**
- "Save $X" phrasing for an auction (that's BIN-only language — an
  auction's gap is not a locked-in saving)
- A maximum-bid recommendation of any kind
- Any predicted or implied final price
- Treating "ends in" as secondary to the price — time-sensitivity is
  co-equal with the price data, not an afterthought

This mirrors `lib/auctionLaneRanking.js`'s own on-site contract exactly —
the social format doesn't get to be looser than the website.

---

## 13. Market-mover structure (deterministic criteria, not implemented)

To avoid a $2→$4 card technically qualifying as "the biggest mover":

| Criterion | Purpose |
|---|---|
| Minimum reference price floor (e.g. $25+) | Excludes cheap commons where a small $ move produces a huge, meaningless % |
| Minimum absolute $ change | A move must matter in real terms, not just proportionally |
| Minimum percentage change | Still required — a $50 move on a $2,000 card isn't a "mover" either |
| Minimum historical depth / confidence | Must pass the same `confidentTrendWindows` anomaly gate the site already applies — a single noisy data point never qualifies |
| Required timestamp coverage | The window's start and end must both have real, dated evidence — no interpolated or assumed prices |

A candidate must clear **all** floors simultaneously (not just one) before
it's eligible for a Market Movers or Biggest Losers post. Exact numeric
floors are a future implementation decision (informed by real trend-window
data volume once available) — not set here, since inventing precise
thresholds without that data would itself be an arbitrary, unjustified
choice matching the exact failure mode this section exists to prevent.

---

## 14. Raw vs graded structure & truth contract

**Required fields:** raw basis (price + condition assumption), grader,
grade, reference timestamp (raw and graded should share a comparable basis
date), spread ($ difference), ratio (graded ÷ raw).

**Truth contract:** raw and graded references are **two separate market
observations**, never a claim that grading a specific raw card will yield
the graded price. Public wording must always read as "here is what raw
copies sell for, and here is what PSA 10 copies sell for" — never "grade
this and get $X." No post may imply a guaranteed outcome from submitting a
card for grading (condition, centering, and grader judgment all vary
per-copy, and the site has no visibility into any specific submission's
outcome).

**Allowed:** "Raw $80 → PSA 10 $340" as a *labeled comparison* of two
reference figures.
**Not allowed:** "Grade this and make $260," "guaranteed grading profit,"
or any phrasing collapsing the two references into a single predicted
outcome.

---

## 15. Template variation without randomness

Target shape: **10 template families × 2-4 controlled layout variants**,
not hundreds of arbitrary designs. Deterministic variation axes:

| Axis | Example variants |
|---|---|
| Template family | The 10 in §4 |
| Headline configuration | Question-framed vs. statement-framed hook |
| Layout variant | Card-art-dominant vs. number-dominant grid balance |
| Chart vs. no chart | Present only where the format calls for it (§10) |
| List size | 3 vs. 5 vs. 7 items, chosen by how much genuinely-qualifying content exists that day (§17) — never padded to hit a fixed count |
| Price-band variant | $25/$50/$100/$250/$500 |
| Pokemon vs. set focus | Same underlying carousel grammar, different anchor entity |

Variation selection is a **deterministic function of the day's actual
qualifying data** (how many strong candidates exist, which pillar has the
freshest content, which price bands have live inventory) — never a random
shuffle for the sake of looking different, matching the same "real
variety, not cosmetic randomization" principle P0.2 already established
for the homepage.

---

## 16. Content rotation (concept only — no schedule implemented)

Illustrative weekly shape, not a commitment:

| Day | Lean |
|---|---|
| Monday | Market Movers (a fresh week's framing fits the "weekly" cadence naturally) |
| Tuesday | Best Deals Found Today / Deal of the Day |
| Wednesday | Raw vs Graded or Grade Spread |
| Thursday | Pokemon Spotlight |
| Friday | Best Deals Found Today (a strong close-of-week format) |
| Weekend | Auction Watch / Set Spotlight |

**Avoiding fatigue:** rotation should be a *default lean*, not a rigid
rule — content selection (§17) always wins over the calendar slot when a
particularly strong or particularly weak day conflicts with it (e.g. don't
force a Market Movers post on a day with no candidate clearing the §13
floors just because it's Monday; do let an exceptional Deal of the Day
bump a lower-conviction scheduled format). Mixing live-deal formats with
education/reference formats (Raw vs Graded, Market Snapshot) across the
week keeps the feed from feeling like a single repeating deal-blast.

---

## 17. Content selection rules (deterministic, no opaque public score)

A candidate qualifies for posting only when it is simultaneously:

- **Sufficiently interesting** — clears the pillar-specific bar (e.g. the
  Market Mover floors in §13, or simply "premium-eligible" for deal
  formats, reusing `isPremiumDealEligible` unchanged).
- **Sufficiently trustworthy** — passes every existing site-side quality
  gate (`isDisplayableDeal`, visual-authenticity, condition/language
  matching) with zero relaxation for social.
- **Sufficiently fresh** — exact-verified within the same bounded age the
  homepage premium lanes already require (P0.2); re-checked again
  immediately before render.
- **Rights-safe** — the card-image mode in use is one that's actually
  cleared (§9); PPT-derived figures only used where confirmed (§13D.1 §6).
- **Non-duplicate** — hasn't been the subject of a post inside its
  cooldown window (§18).
- **Not recently over-used** — the same template family hasn't dominated
  the last N posts even if individually each instance would qualify.
- **Relevant to collectors** — a real card/set/Pokemon a collector would
  recognize or plausibly search for (excludes obscure promo-only SKUs
  from Spotlight formats, for example, without excluding them from
  ordinary Deal formats).

Internal ranking inputs feeding the "sufficiently interesting" test (deal
strength, $ gap, % gap, market value, popularity signal, historical
movement, grade spread) may combine into an internal sort order later —
but per 13D.1's own standing rule, **no such score is ever exposed
publicly** as a "Deal Score" or similar.

---

## 18. Duplicate-content control

| Cooldown | Purpose |
|---|---|
| Same exact listing | Never featured twice, full stop (once posted, retired from candidacy regardless of continued eligibility) |
| Same card (same print) | A minimum gap before the identical print can headline again, even via a different listing |
| Same Pokemon (species) | A looser gap, since Pokemon Spotlight and Deal formats can legitimately both feature "Charizard" without being back-to-back |
| Same set | Similar looser gap, mainly relevant to Set Spotlight recurrence |
| Same template family | Prevents e.g. five straight days of Deal of the Day even if each day's deal individually qualifies |

**The balance:** cooldowns are a tie-breaker among otherwise-qualifying
candidates, never a reason to promote a genuinely weaker candidate over a
stronger one just to hit a diversity quota — mirrors P0.2's own "quality
remains primary" ranking philosophy. If the strongest candidate on a given
day is on cooldown, the system should select the next-strongest
qualifying candidate, not force the cooled-down one through.

---

## 19. Post-expiry problem & content lifecycle

**Lifecycle:** social post → stable PokemonDealFinder landing context
(a real `/deals/[id]`, `/cards/[slug]`, `/pokemon/[slug]`, or `/sets/[slug]`
URL — never a one-off, throwaway page). If the featured deal ends before
or after the post goes up, the landing page truthfully reflects that —
reusing the exact "This deal has ended" + current-listings pattern P0.2
already built for `/deals/[id]`, not a new mechanism.

**Not solved by deleting old posts.** A post isn't retracted just because
its featured deal ended — the post remains as a historical record, and the
destination it links to now tells the truth instead. Automated deletion is
explicitly out of scope for now; a future platform-specific strategy could
reconsider this, but nothing here assumes it.

**Caption/creative wording standard** (to avoid ever implying indefinite
availability): every live-deal post includes a small, consistent
freshness disclaimer — **"Live when checked at [time]. Availability can
change."** — as part of the standard caption schema (§20), not an
optional add-on.

---

## 20. Caption system — structured schema

```
HOOK        one sentence, matches the slide-1 hook formula (§6)
FACT        the concrete data point(s) - price, reference, %, timeframe
EVIDENCE    "Verified [time]" / "[window] dates" - the freshness/basis proof
CONTEXT     one optional sentence of framing (why this matters) - skip if the hook already carries it
CTA         one of the approved CTA families (§23)
DISCLOSURE  "Ad" / affiliate disclosure line, placed near the top per 13D.1 §10 - not buried at the end
```

Illustrative shape only (not a production caption):

> Ad · Found today: [Card].
> Current listing: [price]. Market reference: [reference].
> Currently [X]% below our reference.
> Live when checked at [time]. Availability can change.
> See current Pokemon deals at PokemonDealFinder.

Every bracketed field is a structured-data slot, filled deterministically
from the same data the slide already used — never independently
LLM-generated text describing eBay facts, per the compliance boundary.

---

## 21. Caption length variants

| Variant | Instagram | TikTok |
|---|---|---|
| SHORT | Hook + Fact + CTA + Disclosure only (fits above "more") | Hook + Fact + Disclosure (TikTok captions are read even less than IG) |
| STANDARD | Hook + Fact + Evidence + CTA + Disclosure | Hook + Fact + Evidence + Disclosure |
| DETAILED | Adds Context sentence; used for Educational/Market-Snapshot formats where the "why" genuinely needs a sentence | Rarely used on TikTok — prefer SHORT/STANDARD there and let the on-screen creative carry detail |

No hashtag block counted as part of "caption" length here — see §22.

---

## 22. Hashtag strategy

Current platform reality: hashtags on Instagram/TikTok have materially
diminished discovery value compared to a few years ago relative to the
algorithm's own interest-graph signals — a small, relevant set beats a
large generic block.

**Restrained categories, roughly 3-6 tags per post:**
- **Brand** (1): a single owned tag, e.g. `#pokemondealfinder`.
- **Pokemon TCG** (1-2): broad-category tags a real collector audience
  follows (e.g. `#pokemontcg`, `#pokemoncards`).
- **Card collecting** (0-1): general collecting-audience tags, used
  sparingly, not on every post.
- **Specific set/Pokemon** (0-2, only when genuinely relevant): e.g.
  `#charizard` on a Charizard-focused post — never appended generically.

**Never:** 20-50 hashtag blocks, irrelevant trending tags chosen purely
for reach, or spam-pattern tag stuffing. No hashtags are being deployed
this phase — this is the design for when publishing eventually begins.

---

## 23. CTA system

**Approved CTA families** (all send to PokemonDealFinder first, per the
core positioning — never a direct-to-marketplace CTA as the default,
consistent with 13D.1 §9's Journey-A preference):
- "Browse today's deals →"
- "See current Pokemon deals →"
- "Check current listings →"
- "Explore this card →"
- "See today's finds →"
- "See all [Pokemon/Set] cards →"
- "Watch this auction →"

**Never:** "Buy now before it's gone," "Don't miss out," "Guaranteed
deal," "Profit opportunity," or any variant implying scarcity, urgency, or
a promised financial outcome.

---

## 24. Disclosure placement in the creative system

Template space reserved for disclosure in **two** places on every
affiliate-linked post, matching 13D.1 §10's conservative pattern exactly:
1. **In the caption**, first visible line, before any "see more" truncation.
2. **In the creative itself**, a small persistent "Ad" label in the footer
   zone (§7 grid) for any post whose whole purpose is a specific
   deal/listing.

**Platform-native toggles are additive, never a substitute:** Instagram's
Paid Partnership label (where applicable) and TikTok's Commercial Content
Disclosure toggle (mandatory for any affiliate-linked post per 13D.1 §12)
must both be used on top of the textual disclosure above, not instead of
it — the textual disclosure is the one guaranteed to render regardless of
platform UI changes.

No disclosure text is finalized or published this phase — this is
template *space* being reserved, not copy being shipped.

---

## 25. Landing destination matrix

| Content type | Destination |
|---|---|
| Deal of the Day / Best Deals Found Today / Just Found | `/deals/[id]` (the specific deal/context page) |
| Auction Watch | `/deals/[id]` (same stable context page — already truthful on expiry per P0.2) |
| Pokemon Spotlight | `/pokemon/[slug]` |
| Set Spotlight | `/sets/[slug]` |
| What $X Can Buy | A filtered `/deals` destination (price-band query params) |
| Market Movers / Market Snapshot / Biggest Losers | The relevant card hub (`/cards/[slug]`) or `/pokemon/[slug]` if species-level |
| Raw vs Graded / Grade Spread | The relevant card hub (`/cards/[slug]`), which already shows the full variant/grade price grid |

Homepage-only linking is avoided wherever a deeper, directly-relevant
route already exists — matching the instruction to prefer the destination
with the best continuity. No new routes are proposed; every destination
above already exists in the current site.

---

## 26. Content attribution model (structural, privacy-safe)

Extends 13D.1 §24 unchanged:

```
utm_source=instagram | tiktok
utm_medium=social
utm_campaign=<template family enum, e.g. "deal_of_day" | "market_movers" | "pokemon_spotlight">
utm_content=<position/variant enum, e.g. "slide_hook" | "layout_a" | "chart_variant">
```

**Never** in a UTM value: a card name, Pokemon/set name, eBay listing ID,
or anything identifying a specific user. All values are small, fixed
enums decided at design time (matching every other structural-enum
pattern already used in this codebase's own analytics, e.g.
`lib/analytics/props.js`) — never freeform text derived from the
specific post.

---

## 27. Social success metrics

**Primary (map to real product value):** social→site click-through,
landing-page QCA, affiliate click, Search usage originating from a social
visit, deal/card detail engagement — all aggregate, reusing the existing
PostHog contract unchanged (no new identity data, no new capture
mechanism proposed here).

**Secondary (diagnostics only, never the optimization target):** views,
reach, saves, shares, comments, profile visits. Follower count is
explicitly not a success metric.

---

## 28. Human review checklist (target: ~15-30 seconds per well-formed post)

Before any future publish, a reviewer confirms:

- [ ] Card identity is correct (name, set, variant)
- [ ] Price is correct and matches the source data
- [ ] Market reference is correct and matches the source data
- [ ] The %/$ calculation is arithmetically correct
- [ ] Freshness/verification timestamp is current (re-checked at render, not stale from candidate selection)
- [ ] The underlying listing is still live (for BIN) / still open (for auction)
- [ ] Auction wording follows §12 exactly (no "Save $X," no bid recommendation, no price prediction)
- [ ] Card image mode in use is actually rights-cleared for this post (§9)
- [ ] Disclosure is present in both the caption and the creative (§24), and the platform toggle is set
- [ ] Spelling is "Pokemon," not "Pokémon," everywhere
- [ ] CTA is an approved family (§23) and points to the correct destination (§25)
- [ ] No forward-looking/predictive claim appears anywhere in the copy
- [ ] Nothing suggests official Nintendo/Pokemon Company/eBay affiliation beyond the disclosed partner relationship

A single well-formed post generated correctly by the templated pipeline
should let an experienced reviewer clear this list in well under 30
seconds — the checklist is designed to be fast specifically because every
item is a yes/no confirmation against data the reviewer can see on the
same screen, not independent research.

---

## 29. Future structured content payload (architecture only)

Conceptual shape a future candidate-generation engine would output —
**no eBay data would ever reach an LLM under this shape**; every value
below is either a structural enum or a number/date pulled directly from
already-verified site data, assembled by code, not generated text.

```
{
  content_type: "deal" | "auction" | "market_move" | "raw_vs_graded" | ...,
  template_family: "<one of the 10 in §4>",
  hook_variant: "<enum from §6's numbered formulas>",
  card_identity: { name, set, is_graded, grader, grade },       // structural, not free text
  market_data: { reference, referenceTimestamp, window? },
  deal_data: { price, discountPct, listingType, verifiedAt } | null,
  freshness: { exactVerifiedAt, discoveryAge, checkedAtRenderTime: true },
  destination: { route, params },                                // from §25's matrix
  disclosure: { captionLine, creativeLabel, platformToggleRequired },
  rights_state: { imageMode: "A" | "B" | "C", providerConfirmed: boolean },
  review_state: "pending" | "approved" | "rejected",
}
```

This is the shape a future Level-B pipeline (per 13D.1 §3-4) would pass
between candidate generation → template rendering → human review → publish
— documented now so implementation, once approvals/rights allow it, has an
agreed contract to build against. Not implemented; no code emits or
consumes this shape yet.

---

## 30. Automation boundary

**100% automated (target state):** candidate detection against the
selection rules (§17); all arithmetic (%, $, spread, ratio); freshness/
exact-verification re-checks at render time; template/variant selection
(§15); duplicate-cooldown enforcement (§18); chart rendering from
already-computed, already-anomaly-gated trend data (§10).

**Automated + human approval (target state, per 13D.1's Level B):** final
creative composition; caption assembly from the structured schema (§20);
the destination/disclosure checklist confirmation (§28) before publish.

**Human-only (never automated):** any policy exception (a candidate that's
borderline on a selection rule); any content where image rights are
genuinely unclear rather than confirmed-B/C; any unusual claim a
reviewer flags as needing judgment beyond the checklist (e.g. a legitimately
ambiguous grade-spread framing). Full auto-publishing (Level C) remains
explicitly not recommended, unchanged from 13D.1.

---

## 31. Initial MVP recommendation

**Recommended first 3-5 families**, chosen for rights clarity, data
availability today, differentiation, commercial usefulness, and
automation reliability:

1. **Deal of the Day** — lowest production cost, zero new dependencies, highest reliability.
2. **Best Deals Found Today** — same data/rights profile, slightly higher production cost, strong QCA path.
3. **Just Found** — directly showcases the P0.2 freshness work; strong differentiation ("we check this stuff constantly" becomes visible).
4. **Pokemon Spotlight** — reuses an already-built, already-indexed destination; strong search-intent alignment; low incremental cost once #1-2 exist.
5. *(stretch, if capacity allows)* **Set Spotlight** — same reasoning as #4, lower priority only because Pokemon-level intent is generally stronger than set-level for a general audience.

Deliberately excluded from the MVP: everything requiring PPT off-site
confirmation (Raw vs Graded, Grade Spread, Market Movers, Market
Snapshot) or a chart-rendering system (§10) — not because they're weak
(several are Tier 1/2 on merit) but because they carry a real dependency
this phase didn't resolve. They're the natural second wave once §6 of
13D.1's decision matrix clears.

---

## 32. Originality check

| Template family | How it differs from PriceCharting/Collectr's presentation |
|---|---|
| Best Deals Found Today | Framed as "we found these live opportunities," not a market-tracking recap — every card is a currently-actionable listing, not a price-history entry |
| Deal of the Day | A single-item spotlight format neither reference account centers as a recurring daily format in the same way |
| Just Found | Recency-as-hook is not the primary format observed in the reference accounts — this is built around PokemonDealFinder's own scanning cadence, not a generic "new listing" alert |
| Auction Watch | Grounded in the site's own bid-can-rise truth contract (§12/13C.4's ranking work) rather than a generic "hot auction" framing |
| Raw vs Graded / Grade Spread | Uses PokemonDealFinder's own condition/grade taxonomy and reference sourcing (PPT), not a reproduction of either account's specific comparison layout |
| What $X Can Buy | Framed around live, verified inventory at a price point, not a generic "affordable cards" listicle |
| Pokemon / Set Spotlight | Anchored to real, already-built site destinations (`/pokemon/[slug]`, `/sets/[slug]`) — the post exists to drive to a specific page these reference accounts don't have an equivalent of |
| Market Snapshot | Uses the site's own anomaly-suppressed trend-confidence data, explicitly framed as historical-only (§14 truth contract), a stricter non-predictive standard than typical "movers" content |

Across every family: original visual system (§7, extending the existing
site brand, never reference-account colors/type/layout), original hook
wording (§6, none copied), original caption schema (§20), and a
destination-first CTA model (§23/§25) that routes to PokemonDealFinder's
own pages rather than functioning as a standalone content feed — the
structural differentiator the reference accounts don't share.

---

## 33. What remains blocked, and by what

| Blocked item | Blocked by |
|---|---|
| Any GenAI-assisted caption/creative touching eBay-derived facts | EPN AI Tools approval **[13D.1 §1-2]** — not filed; current EPN Quality review must resolve first |
| Composited eBay listing photos (Mode A) | eBay "Public Display" visual-isolation clause confirmation **[13D.1 §7]** |
| Raw vs Graded, Grade Spread, Market Movers, Biggest Losers, Market Snapshot | PokemonPriceTracker written confirmation on off-site derived-figure use **[13D.1 §6]** |
| Any actual publishing, any platform connection | Explicit owner decision + the above approvals + a built (not just designed) Level-B pipeline |
| Exact numeric floors for Market Movers (§13) | Real trend-window data volume once available; not invented here to avoid an arbitrary, unjustified threshold |

---

## Recommendation for next phase

Once the PPT confirmation and the eBay image-rights clarification
**[13D.1 §33 items]** are resolved (owner action, not a build task), the
natural next phase is a **narrow technical spike**, not a launch: build
just the Level-A pipeline (candidate detection → structured payload →
Mode-B template render) for the two lowest-dependency MVP families (Deal
of the Day, Best Deals Found Today), with output going to a local
preview only — no platform connection, no publishing, still fully
consistent with 13D.1's "Level B eventually, never Level C" recommendation
and this phase's "documentation only" scope. That would be the first
phase to touch actual rendering code; this phase deliberately does not.
