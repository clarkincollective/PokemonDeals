# SOCIAL-CREATIVE-3 — hobby-native visual standard

The newsroom's first real scheduled proof posts were *technically valid but
visually underpowered*: too much empty black field, weak thumbnail impact,
little real card imagery, a generic finance/SaaS-infographic feel. This
phase raised the bar. Nothing here is published or scheduled; Stage 1 and
NEWSROOM-3 stay OFF.

## 1. Hobby-native benchmark checklist (§16)

Benchmark *only* — we study what strong collectibles accounts (Collectr,
We The Hobby, PSA, individual high-follower breakers) do well. We do **not**
copy their branding, layouts, captions, watermarks, or fonts.

A newsroom creative is hobby-native when a collector scrolling their feed
would read it as "someone who actually collects made this", not "a brand
ran a template". Concretely:

- [ ] **A real card is the hero.** The exact canonical printing, large
      (≥ 40% of the frame on a card-specific layout), un-cropped, sharp.
      No AI redraw, no seller photo, no unrelated Pokémon art.
- [ ] **One clear story in the first glance.** At 120 px thumbnail you can
      still tell what the post is about and what the payoff number is.
- [ ] **Real, specific numbers.** Actual asking/sold/landed/market values
      for a named card — never round "example" figures, never fabricated.
- [ ] **Price contrast is visible.** Two comparable prices or a % sit
      next to each other; the delta is the point.
- [ ] **No dead space.** The composition fills the frame with hierarchy
      (hero / primary data / supporting / restrained brand) — not a small
      block of text floating in black.
- [ ] **Restrained brand.** One wordmark, one CTA styled as a label not a
      button. The card and the data carry the post.
- [ ] **Not a corporate infographic.** No stock chart chrome, no gradient
      "dashboard" panels as decoration, no icon soup.
- [ ] **Feed-level variety.** Nine in a row don't look like the same
      template with the numbers swapped (see `feed-grid.html`).

## 2. What each category must show

| Category | Must include | Never |
|---|---|---|
| Market (`market_shape`) | one dominant real stat, a real distribution, one real featured deal card | a bare number wall |
| Education (`asking_vs_sold`, `printing_compare`, `bid_vs_total`) | ≥1 real canonical card, a concrete real contrast, a one-line takeaway | abstract "concept" art, invented examples |
| Deal (`deal_hero`) | the exact card, the real price, the real market reference, the real % | a listing screenshot, a seller image |
| Multi-card (`printing_compare`, `three_up`) | 2–3 real canonical printings/deals, real prices, an aggregate line | filler cards to reach a count |
| Process / story (`bid_vs_total`) | the real worked example end to end | a numbered list with no visual subject |

## 3. QA gates that enforce it

1. `editorialCreativeQa` (deterministic) — hook length, min text size, one
   CTA, one wordmark, stat density, safe zones.
2. `collectibleAppeal` (deterministic, SS17) — card-art present for every
   shown id, hero prominence ≥ 28%, ≥ 2 real numeric callouts, price
   contrast, not-generic-typographic. **Now a required layer in
   `qaStack.runQaStack` (`COLLECTIBLE_APPEAL`)** for any card-specific
   data family.
3. Layer-5 visual review (`lib/newsroom/visualReview`) — GPT-4o vision
   against the hobby-native rubric, **5-sample worst-case** (`--samples`
   default 5). "Technically clean but visually weak" resolves to WATCH,
   not PASS. Underpowered data → the story is WITHHELD, never rendered
   with placeholder numbers (`VISUALLY_UNDERPOWERED_DATA`, SS22).

A family is only autonomous-safe if all three gates pass reliably.

## 4. Series classification (2026-09-08 real review pack)

Source of truth: `lib/social/newsroom/cardLayoutStatus.mjs`.

| Series | Layout | Category | Grade | Autonomous-safe |
|---|---|---|---|---|
| MARKET_SNAPSHOT | market_shape | market | VISUALLY_STRONG_NOW | ✅ |
| WHY_SOLD_PRICES_MATTER | asking_vs_sold | education | VISUALLY_STRONG_NOW | ✅ |
| EXACT_PRINTING_MATTERS | printing_compare | education / multi-card | VISUALLY_STRONG_NOW | ✅ |
| AUCTION_BID_VS_TOTAL | bid_vs_total | process / story | VISUALLY_STRONG_WITH_REDESIGN | ❌ manual review |
| DEAL_DROP | deal_hero | deal (quality floor) | VISUALLY_STRONG_WITH_REDESIGN | ❌ manual review |
| THREE_UNDER_25 | three_up | deal / multi-card | VISUALLY_STRONG_WITH_REDESIGN | ❌ manual review |
| BIGGEST_MOVERS | movers_countdown | market | DATA_NOT_READY | ❌ withheld |

The four `VISUALLY_STRONG_WITH_REDESIGN` families clear both deterministic
gates and score 80–90 on most Layer-5 dimensions, but the conservative
5-sample worst-case gate intermittently returns WATCH. They render for a
human to approve; they are not cleared for unattended scheduling.

## 4a. SOCIAL-CREATIVE-3B — deal_hero + bid_vs_total hardening

A dedicated pass tried to lift `deal_hero` and `bid_vs_total` to
autonomous-safe *without lowering thresholds*. New this pass:

- **`lib/social/newsroom/cardCreativeChecks.mjs`** — an SS17 deterministic
  contract per family, so a borderline reviewer verdict is caught by
  something objective first. `deal_hero`: prices real, market > price,
  rendered % = 1−price/market, one saving statement, market-ref legible
  (≥ 0.32 of the price font), hero 40–60%, no fake-urgency. `bid_vs_total`:
  bid + shipping = landed within rounding (single currency), all three
  present, landed the largest number, non-trivial bid, material shipping,
  hero occupancy. **All deterministic gates PASS on 100 % of real
  samples.**
- **`deal_hero` SS8 commercial-pull gate** (`dealHeroWithholdReason`) — the
  autonomous picker only renders a deal-drop for an iconic species or a
  card with a ≥ $80 market reference; a 45 %-off obscure $22 card is
  WITHHELD (a human may still post it).
- **`deal_hero` redesign** — the hook no longer restates the % (that was a
  duplicated price fact); the market reference is now a legible 64 px
  figure (ratio 0.43), not a strike-through footnote; hero numbers use the
  display sans with −0.03em tracking instead of cramped mono.
- **`bid_vs_total` redesign** — a literal vertical equation
  (`CURRENT BID` `+ SHIPPING` `─` `= YOU PAY`) with real operators and a
  rule line instead of a decorative box; a non-numeric hook so the numbers
  appear only once; the landed total is the single biggest element
  (128 px vs 56 px).

**Result (12 real samples / family × 5-sample worst-case Layer-5,
`npm run social:creative-harden`):**

| family | det gates | Layer-5 worst-case (2 full runs) | individual reviews | FAIL | verdict |
|---|---|---|---|---|---|
| `deal_hero` | every eligible sample PASS | **73 % then 44 %** | 91 % then 80 % | 0 | **MANUAL_ONLY** — misses the ≥ 90 % worst-case bar, and the rate swings 44–73 % between two runs of the *same* samples. The WATCH artifacts score identically to the PASS ones on every rubric dim (TYPO ~71, THUMB ~74, SCROLL ~76) — reviewer nondeterminism at a threshold, not a craft gap. Closest of the manual-only families; blocked on a more deterministic Layer-5 or a policy decision. |
| `bid_vs_total` | 12/12 PASS | **0 % both runs** | ~73 % | 0 | **MANUAL_ONLY** — a *consistent* ceiling, not nondeterminism: the reviewer reads the arithmetic column as "a useful explainer that takes a moment to process". Three design iterations have not moved it. |

`three_up` and `movers_countdown` were reviewed opportunistically (SS21/22)
and left MANUAL_ONLY. **FEED-12 simulation → FEED_PASS** (all mix ceilings
clear once the card-forward CTA zones are used).

## 5. Readiness

- **Manual-review scheduling:** the three `VISUALLY_STRONG_NOW` card-forward
  families + the four already-proven typographic layouts are ready to be
  scheduled *with a human approving each asset*. `deal_hero`,
  `bid_vs_total`, `three_up`, `movers_countdown` are also fine for
  human-reviewed scheduling.
- **NEWSROOM-3 autonomous refill: NOT READY.** The target is ≥ 5
  autonomous-safe families covering market + education + process/story +
  multi-card + deal. Autonomous coverage is still 3 (market + education +
  multi-card). The **deal floor** (`deal_hero`) and **process/story**
  (`bid_vs_total`) did not clear the ≥ 90 % 5-sample worst-case bar in
  SOCIAL-CREATIVE-3B and stay manual-only. Per the phase contract, refill
  stays blocked.
- **Remaining blockers:** (1) `deal_hero` — needs the reviewer-threshold
  nondeterminism resolved (a more deterministic Layer-5, or an agreed
  policy that 91 % individual + 0 FAIL + all deterministic gates + the SS8
  pull gate is sufficient); it is one decision away. (2) `bid_vs_total` —
  needs a genuinely different composition that the reviewer reads as
  scroll-stopping, or acceptance that process/story stays human-curated.
