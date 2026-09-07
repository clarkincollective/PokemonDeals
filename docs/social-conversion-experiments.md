# Social Conversion Experiments — Phase 13E.10A

A deterministic system to learn which **HOOK + CTA + creative family +
platform** actually drives:

```
IMPRESSION → WEBSITE VISIT → DEAL PAGE VIEW → EBAY OUTBOUND
```

for PokemonDealFinder specifically — not likes, and not by assuming
generic social-media advice is correct. **This phase builds the framework
and a dry-run review pack only.** Nothing is published, scheduled, or
rendered to a real creative. No eBay call. No Buffer mutation.

Modules: `lib/social/experiments/`. CLI: `npm run social:experiments`.

---

## 1. KPI hierarchy (§1)

1. affiliate outbound clicks  (highest weight)
2. website visits             (high)
3. deal-page engagement       (medium)
4. platform CTR where available (medium)
5. views / reach              (low — context only)
6. likes / comments           (not scored)

A high-view post that drives no website traffic is **not** a conversion
winner.

---

## 2. Hook library (§2, §3)  — `lib/social/experiments/hooks.mjs`

Builds on the existing `lib/social/creativeSpec` hook engine and its
shared thresholds (`PRICE_CONTRAST_MIN_REF` 100, `PRICE_CONTRAST_MIN_RATIO`
1.8, `ABS_SAVING_MIN` 60) — never a parallel truth model.

| hook | renders (example) | eligibility |
|---|---|---|
| `PRICE_CONTRAST` | `$480 CARD. LISTED FOR $200.` | listed & ref valid; ref ≥ $100; ref/listed ≥ 1.8 |
| `DOLLAR_SAVING` | `SAVE $92 ON ZEKROM …` | listed & ref valid; ref − listed ≥ $60 |
| `PERCENT_GAP` | `72% BELOW RECENT MARKET` | valid discount ≥ 10% (deal-qualification floor) |
| `DISCOVERY` | `JUST FOUND: 72% BELOW RECENT MARKET` | `freshnessState === "JUST_FOUND"` (the real rule, not "recent") |
| `QUESTION` | `WOULD YOU PAY $40 FOR THIS?` | real listed price + market reference (so the question is factual); one plain question, no "?!" |
| `COLLECTION` | `4 DEALS WE FOUND TODAY` | `itemCount ≥ 3`; the rendered number **is** `itemCount` (never padded) |
| `COLLECTION_BELOW_MARKET` | `4 POKEMON CARDS BELOW RECENT MARKET` | same as `COLLECTION` |
| `UNDER_PRICE` | `4 POKEMON CARDS UNDER $25` | `itemCount ≥ 3` **and** every item confirmed `<= threshold` |
| `MARKET_MOVEMENT` | `THIS CARD IS UP 37% OVER 90 DAYS` | `family === market_mover`; `|movement| ≥ 8%`; confidence ≠ `low`; confident direction (the `confidentTrendWindows` gate, via `priceMovement`) |

`renderHook()` refuses an ineligible hook **and** any string matching
`BANNED_HOOK_PHRASES` (§23). No hook infers or invents urgency.

---

## 3. CTA library (§4)  — `lib/social/experiments/ctas.mjs`

Labels reuse `creativeSpec.CTA_INTENTS`; `CHECK_CURRENT_LISTING` is new.

| CTA | label | valid destinations |
|---|---|---|
| `SEE_LIVE_DEAL` | "SEE THE LIVE DEAL" | `deal_exact` |
| `CHECK_CURRENT_LISTING` | "CHECK THE CURRENT LISTING" | `deal_exact` |
| `SEE_TODAYS_DEALS` | "SEE TODAY'S DEALS" | `deals_index` |
| `SEE_ALL_LIVE_FINDS` | "SEE ALL LIVE FINDS" | `deals_index` |
| `COMPARE_LIVE_LISTINGS` | "COMPARE LIVE LISTINGS" | `card_hub`, `deals_index` |
| `FULL_PRICE_HISTORY` | "FULL PRICE HISTORY" | `card_hub` |

`ctaFitsDestination()` blocks a CTA on a destination it can't fulfil.
`destinationKindForRoute()` maps a real route → kind
(`/deals/12345` → `deal_exact`, `/deals` & `/deals/<cat>` → `deals_index`,
`/cards/<slug>` → `card_hub`).

---

## 4. Assignment method (§7)  — `lib/social/experiments/assignment.mjs`

`assignVariant(experiment_id, { contentId, platform })` — **pure**:

```
sha256(`${experiment_id}::${content_id}::${platform}`)  →  first 32 bits  →  mod 2  →  A | B
```

- same `(experiment, content, platform)` → always the same variant
- **no `Date.now()`, no `Math.random()`**
- ~50/50 balanced over a larger sample (test: 1600 pairs → ratioA within 44–56%)
- per-platform: the same content on Instagram vs X can land on different
  variants (§9)
- `explainAssignment()` returns the key + full SHA-256 + bucket for owner
  inspection: `npm run social:experiments -- assign <content_id> <platform>`

An experiment only **applies** to a candidate when **both** of its
variants are eligible (`experimentApplies`), so eligibility never biases
the split. When it doesn't apply, the placement uses the deterministic
default hook/CTA and `experiment_id` is `null`.

---

## 5. Initial experiment slate (§10)  — `lib/social/experiments/experiments.mjs`

One primary variable per experiment. `MAX_EXPERIMENTS_PER_PLACEMENT = 1`.

| id | dim | family | A | B |
|---|---|---|---|---|
| `e1_deal_hook_pricecontrast_vs_percentgap` | HOOK | deal_drop | PRICE_CONTRAST | PERCENT_GAP |
| `e2_deal_cta_seelivedeal_vs_checkcurrentlisting` | CTA | deal_drop | SEE_LIVE_DEAL | CHECK_CURRENT_LISTING |
| `e3_collection_hook_foundtoday_vs_belowmarket` | HOOK | hook_carousel | COLLECTION ("N deals we found today") | COLLECTION_BELOW_MARKET ("N cards below market") |
| `e4_mover_cta_pricehistory_vs_comparelistings` | CTA | market_mover | FULL_PRICE_HISTORY | COMPARE_LIVE_LISTINGS |

`PRIMARY_EXPERIMENT_BY_FAMILY`: deal_drop → E1, hook_carousel → E3,
market_mover → E4, **brand_ad → none** (minimal experimentation, §8).

---

## 6. First 30-post strategy (§22)

- The first sequence of Deal Drops runs **E1 (hook)** as the single
  dimension. Whichever variant deterministic assignment picks is the one
  used — no manual override.
- **Do not** simultaneously vary hook + CTA + layout + platform copy on
  one post. One dimension per placement.
- Experiments run **across separate content opportunities**, balanced over
  time (Deal 1 → A, Deal 2 → B, Deal 3 → A, …) — **never** two
  near-identical posts of the same card to the same audience the same day
  (§6). The planner's own exact-print / card / species cooldowns already
  prevent same-card repetition.

---

## 7. Learning states + winner rules (§11, §14)  — `lib/social/experiments/learning.mjs`

`min(published placements per variant)`:

| count | state |
|---|---|
| `< 10` | `INSUFFICIENT_DATA` |
| `10–19` | `EARLY_SIGNAL` |
| `20–39` | `PROMISING` if the effect is meaningful, else `NO_CLEAR_WINNER` |
| `40+` | `WINNER_CANDIDATE` if meaningful **and** consistent across the 24h & 7d windows, else `NO_CLEAR_WINNER` |

`currentLeader()` names a variant **only** at `PROMISING`+ with a
meaningful effect (`MEANINGFUL_RELATIVE_EFFECT = 0.15` relative). Below
that it is `n/a` or `NO_CLEAR_WINNER`. The evaluator is **read-only** and
never changes production creative — a human decides.

---

## 8. Conversion score (§12)  — `lib/social/experiments/score.mjs`

`conversionScore(funnel)` — weighted, renormalised over the components
that actually have data. Raw components are always returned separately.

| component | weight | formula |
|---|---|---|
| `affiliate_outbound_rate` | 0.45 | affiliate_outbound / site_visits |
| `website_ctr` | 0.30 | site_visits / impressions (‖ reach ‖ views) |
| `deal_page_engagement` | 0.15 | deal_page_views / site_visits |
| `platform_ctr` | 0.07 | provider-reported |
| `views_context` | 0.03 | log10(impressions)/6 — context only |

- every component is `null` unless **both** its inputs are real numbers —
  a missing / unsupported metric is **never** treated as `0`
- the overall score is `null` unless `affiliate_outbound_rate` **and**
  `website_ctr` both have a value

---

## 9. Performance feedback plan (§13)  — `lib/social/experiments/report.mjs`

Uses the existing 13E.7A metrics + attribution layer — no new analytics
system. Each PUBLISHED ledger row carries `experiment_id` + `variant_id` +
`content_id`. The report joins:

```
ledger row.metrics (impressions/reach/views, engagement_rate)
  +  attribution-import.json[content_id]  ( attributed_visits, affiliate_outbound, deal_page_views )
  ->  per-variant funnel  ->  conversionScore()  ->  evaluateExperiment()
```

`npm run social:experiments -- report` prints per variant: placements,
impressions, visits, outbound, outbound rate, website CTR, score, state —
then `STATE` + `CURRENT LEADER`. Before any experiment content publishes
it prints **`NO QUALIFYING DATA`** and every state is `NOT_AVAILABLE_YET`
(no fake 0).

---

## 10. Exploration policy (§15)  — DESIGN ONLY

`EXPLOITATION_POLICY` = 75% winner / 25% explore, **`enabled: false`**.
Even after a `WINNER_CANDIDATE`, the planner never routes 100% through one
variant. Not enabled as autonomous behaviour. Human approval required. No
auto-promotion from the evaluator.

---

## 11. Planner integration (§19)  — `lib/social/planner/planner.mjs`

`assignExperimentForPlacement(candidate, platform)` runs in the
`entries.push` block **after** scoring / tiering / diversity / freshness /
`choosePlacements` — it only chooses among already-eligible **creative
variants** and adds `experiment_id` / `variant_id` / `hook_variant` /
`cta_variant` / `experiment_hypothesis` / `experiment_dimension` to the
plan entry. It is **never** used in a gate, filter, `continue`, or
`notScheduled.push` — deal qualification, freshness, rights, QA and
platform eligibility are untouched (tested).

---

## 12. Batch freeze (§20)  — `lib/social/distribution/batch.mjs`

`buildBatch` freezes each placement's `experiment { experiment_id,
variant_id, hook_variant, cta_variant, hypothesis }`, and
`approvalChecksum` hashes those four fields. Any change to the experiment
after `approveBatch` → `batchApprovalValid` fails → `revalidatePlacement`
blocks the send. **No experiment variant changes at send time** (tested).

---

## 13. Operator dashboard (§21)  — `lib/social/operator.mjs` + `scripts/socialDashboard.mjs`

A "Conversion experiments" section: per experiment — planned today A/B,
published A/B, `state`, `current leader`. Before anything publishes:
`NOT_AVAILABLE_YET`, no fake 0. Read-only; the dashboard never changes
production creative.

---

## 14. Hook quality check (§16)

13E.10A owns the **text** safety gate: `renderHook()` refuses an
ineligible or banned-phrase hook, and every number in a hook comes from a
gated `facts` field (truthful, no invented urgency). The **visual**
one-second-clarity checks (tiny text, clutter, focal card, CTA visible,
platform-safe length) remain the existing render QA
(`lib/social/videoQa.mjs` / `reviewSummary.mjs`) + the Impeccable pass at
render time — this phase adds no new rendered surface.

---

## 15. Review pack (§17, §18)  — `lib/social/experiments/reviewPack.mjs`

`npm run social:experiments -- review-pack` — a DRY-RUN, structured
side-by-side for E1–E4 from the committed fixture only, labelled
**`SIMULATION / REVIEW ONLY — fixture data, NOT live, nothing published`**.
Per experiment: hypothesis, dimension, family, destination kind, variant
A/B, "why this test matters", and 1–2 fixture examples showing the exact
rendered hook + CTA string for each variant (or `NOT RENDERABLE — <reason>`).
No second renderer — text manifest at
`.social-preview/experiment-review-pack/manifest.json`.

**Observed on the committed fixture:** E1 renders
`"$141 CARD. LISTED FOR $40."` vs `"72% BELOW RECENT MARKET"` (Ditto),
`"$4,425 CARD. LISTED FOR $1,475."` vs `"67% BELOW RECENT MARKET"`
(Lugia). E2 varies only the CTA on the same hook. E4 renders
`"THIS CARD IS UP 37% OVER 90 DAYS"` with `FULL PRICE HISTORY` vs
`COMPARE LIVE LISTINGS`. E3 is `UNAVAILABLE` — the fixture carousel has
only 2 distinct cards (< 3), so neither COLLECTION variant is eligible
(truthful "no padding").

---

## 16. Content safety (§23)

`BANNED_HOOK_PHRASES` blocks (default: never): "you won't believe", "buy
now", "last chance", "selling fast", "going fast", "act now", "don't
miss", "guaranteed profit/savings/return", "easy money", "invest now",
"must buy", "once in a lifetime", "limited time/stock", "only N left". No
investment-return promises.
