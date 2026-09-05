# Daily Social Content Production Workflow — Phase 13E.1

**Status: local production tooling. Nothing in this workflow publishes,
schedules, or connects to any platform.** It turns the existing local
social MVP ([`docs/social-creative-system.md`](./social-creative-system.md),
Phase 13D) into a repeatable *daily* content-production run that a human
reviews and then posts by hand.

This document is the companion to, and does not re-litigate, the
load-bearing constraints established earlier:

- [`docs/social-compliance-readiness.md`](./social-compliance-readiness.md)
  (13D.1) — no eBay data into GenAI without EPN "AI Tools" approval, no
  composited eBay imagery before written confirmation, human-approval-gated
  publishing, no full auto-publish, approved affiliate-disclosure wording.
- [`docs/ppt-social-rights-readiness.md`](./ppt-social-rights-readiness.md)
  — what PokemonPriceTracker-derived data may and may not appear in social
  content.
- [`docs/social-creative-system.md`](./social-creative-system.md) (13D.2–13D.4)
  — the Mode-B template blueprint, caption model, and review checklist this
  workflow reuses unchanged.

Section anchors used from code comments in `lib/social/*.mjs` and
`scripts/socialDaily.mjs` are the **§N** headings below.

---

## §1. What the workflow is

One command:

```
npm run social:daily
```

runs `scripts/socialDaily.mjs` and, from a **single** read of the current
active deal pool, produces a day's worth of candidate posts into
`.social-preview/` for human review. It never posts anything.

Pipeline, in order:

1. **Read** — one Supabase read of the current socially-eligible active
   deal pool (same query the older `social:preview` uses).
2. **Rank & select candidates** — the unchanged `pick*` selectors from
   `lib/social/candidates.mjs` choose the best row/grouping for each
   content family.
3. **Rights / compliance gate** — `dailyMix.rightsGate()` fails a family
   closed if the rights state isn't what the workflow was built against
   (§7).
4. **Cooldowns** — deterministic, file-backed suppression (§17) removes
   anything posted too recently.
5. **Daily mix** — at most one post per family, target 3–5, *fail closed
   to fewer* when inventory is thin (§25); within-batch de-duplication so
   the same deal / Pokemon / set never headlines twice.
6. **Visuals** — Mode-B 1080×1350 PNGs (variant A and B) per selected
   post, rendered by the existing `lib/social/render.mjs` (one headless
   Chrome, reused).
7. **Captions** — deterministic Instagram + TikTok caption variants
   (§15) plus a small hashtag set (§16), written to text files.
8. **Review gallery** — `.social-preview/index.html`, a review-only queue
   with per-post facts, the auto-check checklist, rights state, and
   **mix-imbalance warnings** (§18).
9. **Print** — a console summary ending with the gallery path and an
   explicit "nothing was published" line.

### Not in scope (unchanged from 13D.1)

No auto-publish. No Instagram/TikTok/Buffer/Meta API. No GenAI anywhere in
the path. No eBay contact. No new opaque public "deal score". No CMS. Human
review is required before anything is posted, by hand, by the owner.

---

## §2. Content pillars (families)

`DAILY_FAMILIES` in `lib/social/dailyMix.mjs`, fixed order:

| Family | Content type | What it is | Selector |
| --- | --- | --- | --- |
| `deal-of-day` | `deal_of_day` | The single strongest verified Buy-It-Now deal right now. | `pickDealOfTheDay` |
| `just-found` | `just_found` | The newest verified BIN deal — discovered inside the Just-Added window *and* re-verified inside the social-freshness ceiling. | `pickJustFound` |
| `pokemon-spotlight` | `pokemon_spotlight` | The Pokemon (species) with the deepest set of live socially-eligible deals. | `pickPokemonSpotlight` |
| `set-spotlight` | `set_spotlight` | The set with the deepest set of live socially-eligible deals. | `pickSetSpotlight` |
| `market-snapshot` | `market_snapshot` | An aggregate "state of the under-market opportunity set today" post (§7). | `pickMarketSnapshot` |

The older multi-card **Best Deals** carousel (`best_deals_found_today`)
is deliberately *not* in the daily mix; it stays available via
`npm run social:preview`.

---

## §3. Candidate selection

Every family re-runs the **unchanged** eligibility gates via the existing
selectors — there is no second, looser path:

- premium exact-verification + social-freshness ceiling
  (`SOCIAL_FRESHNESS_MAX_AGE_HOURS` = 6h, half the premium exact-verify
  window) from `lib/social/eligibility.mjs`;
- variant-strict matching and the disqualification reasons already applied
  by the scanner;
- flagship ranking (`lib/flagshipRanking.js`) for "which is best".

A family that can't produce a candidate is **skipped with a stated
reason** (shown in the gallery's "not selected today" list), never
back-filled with a weaker row.

---

## §7. Market Snapshot — why it is rights-safe

`lib/social/marketSnapshot.mjs`. The Market Snapshot is deliberately the
most conservative possible market-intelligence framing:

- It reads **only** fields already present on verified `deals` rows and
  already used by every other social family: `market_price`,
  `discount_pct`, `total_price_usd`.
- It **never** touches PokemonPriceTracker price-history, "biggest movers",
  "biggest losers", grade-spread / raw-vs-graded comparisons, or any
  time-series. Those remain behind their own rights gate **even though
  `ppt_social_data` is now `CLEARED`** — "cleared to state today's on-site
  market reference" is not "cleared to redistribute the upstream dataset".
- Everything it states is a plain aggregate of *today's* socially-eligible
  BIN pool (count of cards under reference, median gap, median listed
  price, the single widest-gap example card), framed editorially — never
  as a forecast, a prediction, or a proprietary data dump.
- It needs a real spread (`MARKET_SNAPSHOT_MIN_DEALS` = 6) or the day
  simply skips it (fail closed, §25).
- The named example card is the highest flagship-ranked card **not already
  headlining another post in the batch**, so the day doesn't show the same
  card twice; the aggregate stats still cover the whole pool.

If `ppt_social_data` ever reverts from `CLEARED`, `rightsGate()` drops this
family automatically.

---

## §15. Platform caption variants

`lib/social/caption.mjs`, `assemblePlatformCaptions(payload)` → `{ instagram, tiktok }`.

Both variants are **deterministic** (no randomness, no model) and built
from the same whitelisted payload fields:

- **Instagram** (`variant: "instagram"`, alias `"standard"`): hook →
  factual line → evidence/context → soft CTA → disclosure.
- **TikTok** (`variant: "tiktok"`, alias `"short"`): hook → factual line →
  soft CTA → disclosure. Shorter; the same opening hook line as Instagram.

Caption rules (enforced by `reviewSummary.checkCaptionCompliance`, tested):

- The factual line states the **live eBay listing price** vs. **our market
  reference** and the **current** percentage below reference — present
  tense, no projection.
- Wording is "Live eBay listing" / "eBay listing", never "our listing",
  "we're selling", or any ownership/authage guarantee.
- No fake scarcity or urgency ("only N left", "hurry", "won't last",
  "buy now", …).
- Soft CTA only, always ending "…on PokemonDealFinder".
- Ends with the approved disclosure line (see §Disclosure).
- No raw listing IDs, no user/session identity, ever.

### Disclosure

`DISCLOSURE_LINE` (single source of truth in `caption.mjs`, re-exported via
`payload.disclosureBlock()`):

```
Ad · PokemonDealFinder is an eBay Partner Network affiliate and may earn a commission from qualifying eBay purchases.
```

Creative label: **`Ad`** (an EPN-approved label per 13D.1). The TikTok
Commercial Content Disclosure toggle is flagged as required
(`platformToggleRequired: true`) for the human poster.

---

## §16. Hashtags

`lib/social/hashtags.mjs`, `buildHashtags(payload)`. Deterministic, small:
3 fixed base tags + one type-specific tag + up to two derived from the
subject name, deduped and capped at 6. Written to `hashtags.txt` separately
from the caption so the reviewer places them deliberately. None of EPN's
non-approved disclosure hashtags (`#eBayad`, `#Endorsement`, `#Partner`, …)
are ever emitted.

---

## §17. Cooldown policy

`lib/social/cooldown.mjs`. History lives in
`.social-preview/post-history.json` (git-ignored). It is **only** written
by the explicit owner command:

```
npm run social:daily record <family> [<family> ...]
```

run **after** the owner has actually posted those pieces by hand. Nothing
auto-records, because nothing auto-publishes.

`COOLDOWN_WINDOW_HOURS`:

| Key | Window | Meaning |
| --- | --- | --- |
| `deal` | `Infinity` | The exact same deal id is **never** posted twice. |
| `card` | 14 days | Same canonical card (name + set). |
| `pokemon` | 3 days | Same Pokemon (species). |
| `set` | 7 days | Same set. |
| `template` | 24 h | Same template family — **soft**: rotates, does not block. |

`isBlockedByCooldown()` blocks on `deal || card || pokemon || set` (not
`template`). `firstBlockingReason()` renders the human explanation shown in
the gallery.

---

## §18. Daily mix — imbalance warnings

`dailyMix.batchMixWarnings(selected)` flags (never silently ships) a batch
that is editorially lopsided:

- every subject is Charizard/Pikachu, or every post is the same species;
- the same exact card headlines more than one post;
- most of the batch is the same set;
- every post is the same content type / composition.

Warnings render as a banner at the top of the review gallery. They are
advisory — the reviewer decides — but they are always visible.

---

## §25. Thin inventory — fail closed

Target is 3–5 strong posts. When the pool can't support that, the workflow
produces **fewer**, never lower-trust ones, and never fabricates a
candidate to hit a number. An empty pool produces an empty gallery with an
explicit "expected behaviour, not an error" message. This is a hard rule
from the brief and is covered by tests.

---

## Rights state (§7, and `lib/social/rights.mjs`)

`RIGHTS_STATE` is the frozen single source of truth. Current values:

| Capability | State | Why |
| --- | --- | --- |
| `ppt_social_data` | `CLEARED` | Owner-confirmed (13E.1, 2026-09-06): today's on-site market reference may be stated in social content. Does **not** extend to redistributing PPT time-series / movers / grade spreads (§7). |
| `card_image` | `NOT_CLEARED` | No cleared right to composite TCGplayer/PPT card artwork into creatives → **Mode B** (no `<img>` in any template). |
| `ebay_seller_images` | `NOT_CLEARED` | No written confirmation that eBay seller photos may be reused in creatives. Tracked separately from `card_image`. |
| `ebay_genai` | `NOT_ALLOWED` | EPN "AI Tools" special-business-model approval has **not** been filed or granted (no evidence in repo/docs). No eBay-derived data may be passed to any GenAI system. This workflow uses **no** GenAI regardless. |
| `publishing` | `DISABLED` | No auto-publish path exists. All output is local review only; the owner posts by hand. |

`RIGHTS_STATE_REASON` carries the one-line rationale for each key and is
rendered per-capability in the review gallery.

### EPN "AI Tools" approval — explicit state

**Not filed, not granted.** Per `docs/social-compliance-readiness.md` and
`docs/ppt-social-rights-readiness.md`, passing eBay data to a generative
model requires a specific EPN special-business-model approval which has not
been requested. Until that changes, `ebay_genai` stays `NOT_ALLOWED` and
the daily workflow must remain fully deterministic. Do not add a model call
to any stage of this pipeline.

---

## Review workflow

1. `npm run social:daily` → open `.social-preview/index.html`.
2. For each candidate: check the rendered slide against the fact table,
   confirm spelling ("Pokemon", never "Pokémon"), confirm the CTA reads
   naturally, read both caption variants, sanity-check the hashtags.
3. Heed the auto-check list — any `MISMATCH` / `do not approve` line means
   drop the post.
4. Heed the mix-imbalance banner; swap or drop posts to rebalance.
5. Approve/reject locally (the gallery stores your choices in
   `localStorage` only — nothing leaves the browser).
6. Post the approved pieces **by hand**, with the `Ad` label and (TikTok)
   the commercial-content toggle.
7. `npm run social:daily record <family> ...` for what you actually posted,
   so cooldowns count it.

---

## Files

| File | Role |
| --- | --- |
| `scripts/socialDaily.mjs` | The `social:daily` command: read → build batch → render → write → gallery → print; `record` subcommand. |
| `lib/social/dailyMix.mjs` | Family list, per-family candidate build, rights gate, cooldown application, within-batch de-dupe, mix warnings, `buildDailyBatch`. |
| `lib/social/marketSnapshot.mjs` | The Market Snapshot content type (§7). |
| `lib/social/hashtags.mjs` | Deterministic small hashtag sets (§16). |
| `lib/social/cooldown.mjs` | Cooldown windows, key derivation, file-backed history (§17). |
| `lib/social/caption.mjs` | Deterministic Instagram/TikTok caption assemblers + disclosure line (§15). |
| `lib/social/gallery.mjs` | The review-only daily gallery. |
| `lib/social/rights.mjs` | `RIGHTS_STATE` / `RIGHTS_STATE_REASON` frozen source of truth. |
| `lib/social/reviewSummary.mjs` | Auto-check checklist + `checkCaptionCompliance`. |
| `tests/scanner/social-daily-workflow.test.mjs` | Workflow test suite (brief §26 list). |

All rendering, template, payload-whitelist, and eligibility code is reused
unchanged from Phase 13D.
