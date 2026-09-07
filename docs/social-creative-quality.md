# Social Creative Quality — Phase 13E.11A

A creative-quality audit and template polish of the **existing** social
renderers (`lib/social/templates.mjs`, `lib/social/videoDocument.mjs`).
No brand redesign, no new renderer, no new content family. Nothing here
publishes, schedules, or calls eBay / Buffer.

Goal: the creative reads like **premium collectible-market media**, not an
affiliate ad. One headline, one card, one factual comparison, one CTA.

Review pack: `npm run social:creative-quality` →
`.social-preview/creative-quality/manifest.json` (+ `e1_variant_A.html`,
`e1_variant_B.html`). Labelled **SIMULATION / REVIEW ONLY** — fixture data.

Grading heuristic: `lib/social/creativeQa.mjs` (deterministic, not vision).
Background ranking: `lib/social/backgroundQuality.mjs`.

---

## 1. Visual hierarchy rules

The eye should land in this order, every family:

1. **Card** — the artwork is the hero object. It occupies the largest
   contiguous area and is never cropped by a safe zone.
2. **Hook** — one uppercase display line, ≤ 3 lines, the largest *text*.
   It is the framing (the experiment-varied content). Nothing else on the
   canvas may be set larger than the hook.
3. **One factual comparison** — the price row (`LISTED (USD)` vs
   `MARKET REF (USD)`) or, for a Mover, the single move figure.
4. **CTA** — text-first, one line + destination URL. No filled button.
5. **Disclosure** — freshness + `Ad`, quiet, bottom.

Banned: a third loud number competing with the hook; four equally-weighted
blocks; a big directional green/red trading figure; fake urgency; a direct
"SHOP eBay" CTA.

---

## 2. Deal Drop — first-live spec (§21, FROZEN)

| Aspect | Spec |
| --- | --- |
| Layout | **Version A**, hero split. Card on one side (`productWidthPct` ≈ 54%), identity + one small phrase cue on the other. Hook above the split. Price row + one trust line + CTA below. |
| Aspect ratio | 4:5 static `1080×1350` for the static baseline; 9:16 `1080×1920` for Reel / TikTok / Short. |
| Hook placement | Top, above the hero split. `.hook-line` 64px static / 78px video. Uppercase, `max-height:3.4em` (static) / `3.2em` (video), overflow hidden → hard ≤ 3-line bound. |
| Card scale | `.hero-split .prod .card-art` `max-height:700px` on 1080×1350 (~61% of the 1142px usable height). Video `--cah:560px`, `max-width:74%`. |
| Price hierarchy | `LISTED (USD)` at 52px (`T.price`), `MARKET REF (USD)` dim at 34px (`T.priceRef`), no strikethrough. When a hook leads, the standalone `%` **steps down to its compact form** (56px `.metric.compact .fig`, below the 64px hook) — a secondary data cue, never a competing headline. It is byte-identical in every E1 variant. |
| CTA | `zCta` — the resolved experiment label + one arrow, then `PokemonDealFinder.com`. No filled button, no "SHOP/BUY NOW", no direct eBay link in the creative. |
| Trust line | One quiet `context` line: `Live on eBay <MK> · Market ref recent sold prices`. Full affiliate disclosure lives in the caption; `Ad` + freshness in the disclosure bar. |
| Background | **`clean_editorial`** (STRONG). First-live rotation is limited to non-WEAK styles (`clean_editorial`, `collector_desk`). |
| Accent colour | Green only where a positive saving backs it (discount > 0). Never applied to the phrase cue. |

### Why the standalone % figure was stepped down

Before 13E.11A the Deal Drop rendered an experiment hook **and** a 140px
standalone `%` figure at full display size — two headlines fighting for the
first glance, and for `PERCENT_GAP` the same `%` stated twice. The figure
is kept (factual integrity across A/B/C renders is a hard contract) but,
whenever a hook leads, it renders in its **compact** form (56px, below the
64px hook) with no change to figure, size, or accent between variants. This:

- makes the hook unambiguously the hero (§2/§4),
- keeps exactly one *display-size* headline plus one factual comparison,
- **de-confounds experiment E1** — `PRICE_CONTRAST` vs `PERCENT_GAP` differ
  *only* in the hook text. Card, background slot, layout, scale, the
  compact % cue, price row and CTA are byte-identical (verified by the
  review pack's `layout_identical_except_hook` diff and by
  `tests/scanner/social-creative-quality-13e11a.test.mjs`).

---

## 3. Safe zones / mobile crop safety (§13)

Static `ig_portrait` safe rect: `{ top:96, right:72, bottom:112, left:72 }`.
9:16 uses `SHARED_SAFE = { top:260, right:96, bottom:500, left:96 }`
(the max of `reel_9x16` and `tiktok_9x16` in `PLATFORM_TARGETS`), so one
render is safe on both. Every factual element is placed inside the
`.safe` / `.canvas` padding by the renderer — the density heuristic
asserts this structurally (`safe_zone_structured`, P0).

Card occupancy floor: card height / usable canvas height ≥ **0.34**.
Deal Drop static ≈ 0.61, video ≈ 0.46, Market Mover ≈ 0.42.

---

## 4. Typography

| Role | Token / value | Notes |
| --- | --- | --- |
| Hook | 64px static / 78px video, weight 800, uppercase | the hero text; ≤ 3 lines |
| Card identity | `T.title` 60px (`titleSm` 44px long-name tier) | |
| Listed price | `T.price` 52px, tabular | |
| Market ref | `T.priceRef` 34px, dim, no strikethrough | |
| Phrase cue / micro-labels | `T.label` 22px, `+0.10em` | the floor — nothing factual smaller |
| CTA line | `T.cta` 34px | |
| Disclosure / freshness | `T.fine` 22px | |

Minimum on-canvas text: **22px**. `min_text_px` (P2) enforces it against
inline font sizes.

---

## 5. Market Mover rules (§15–§16)

- **No directional green/red on the move figure.** `.mover-move` is
  `C.ink` (neutral), 112px. The chart uses a neutral accent
  (`{ color: C.inkSub, allowed: false }`), not `resolveAccent("movement")`.
  A price *rise* is not a saving; the trading-app aesthetic is banned.
- `resolveAccent` itself is unchanged (tests assert its behaviour) — the
  neutralisation happens at the Mover render call sites only.
- Card presence raised: `.mover-stack-card .card-art` `max-height:480px`,
  `max-width:56%` (was 420 / 52%).
- The chart must plot **real** movement series from the fixture / history —
  never a decorative sparkline.

---

## 6. Hook Carousel rules (§17)

- Cover slide: one hook line (`hook` token 132px), the deterministic
  count, one swipe affordance. No per-card price soup on the cover.
- Card count is **exact** — the carousel renders the number of cards it
  claims (`e3` experiment: `COLLECTION` "found today" vs
  `COLLECTION_BELOW_MARKET`). No "+N more" inflation.
- Close slide legitimately carries the wordmark a second time
  (`brand_mark_max = 2`).

---

## 7. Brand Ad rules (§18)

- Fallback hook copy is factual: **"Pokemon cards listed below recent
  market prices"** (was "Stop overpaying for Pokemon cards"). No digit-`%`
  claim in the fallback, so it stays true without a specific deal.
- Screenshot-backed (Version D); no fabricated UI.

---

## 8. Background quality ranking (§8)

`lib/social/backgroundQuality.mjs` ranks the four existing
`STYLE_FAMILIES`. WEAK styles stay in the library for later data-driven
A/B but are **excluded from the first-live rotation**.

| Style | Tier | First-live | Why |
| --- | --- | --- | --- |
| `clean_editorial` | STRONG | ✅ (Deal Drop default) | Deep charcoal, negative space, magazine minimalism. Supports the card, never competes. |
| `collector_desk` | OK | ✅ | Authentic collectible-desk feel; slightly busier, so not the default. |
| `abstract_market` | WEAK | ❌ | Most "generic AI look" + gradient density; ascending step lines compete with the card. |
| `dark_market_intelligence` | WEAK | ❌ | Dark data grid + red glow reads as a crypto price-alert app (§15 trading aesthetic). |

---

## 9. Impeccable grading (§24)

`categoryGrades(meta)` → PASS / WATCH / FAIL for eight categories, derived
from the deterministic density checks (a missing informing check → WATCH,
never a silent PASS):

`HOOK_CLARITY` · `CARD_DOMINANCE` · `FACT_HIERARCHY` · `CTA_CLARITY` ·
`TRUST` · `BRAND_CONSISTENCY` · `MOBILE_LEGIBILITY` · `PREMIUM_FEEL`.

`densityGrade`: **PASS** = no P0/P1 failure and score ≥ 0.9;
**WATCH** = score ≥ 0.7; **FAIL** otherwise. P0×3 / P1×2 / P2×1 weights.

Post-polish review-pack result (fixture "Ditto" deal): Deal Drop E1 A and
B both **PASS (1.0)**, all eight categories PASS; Market Mover **PASS**,
no directional colour.

---

## 10. First-live platform recommendation (§22)

| Platform | First Deal Drop format | Rationale |
| --- | --- | --- |
| Instagram | **Reel / 9:16** (the 13E.4 motion master). | Reel gets the most first-view distribution. *Not an assumption that video always wins* — if a later review finds the 4:5 static reads better for a given card, ship static. |
| TikTok | The **same 9:16 motion master**, original audio only. | One render, platform-safe. |
| X | **Strong 4:5 static** + the concise frozen X text (`platformCopy`, 13E.5B). | No video needed for the first Deal Drop; static + tight copy fits the timeline. |
| YouTube | **9:16 Short** (same master) + deterministic title + description. | Shorts surface reads the 9:16 master directly. |

Static vs Reel for the *first* IG Deal Drop: lead with the Reel, but keep
the 4:5 static rendered and ready — it is the X asset anyway, and it is the
fallback if the motion master fails QA.

---

## 11. What changed in 13E.11A

| File | Change |
| --- | --- |
| `lib/social/templates.mjs` | Hook 56→64px + `max-height:3.4em` clamp. Standalone % figure **steps down to compact** (72→56px) whenever a hook leads, so the hook is the only display-size headline. Deal card `max-height` 640→700px; stack card 600→640px / 76→80%. `productWidthPct` default 50→54. Market Mover move figure neutralised to `C.ink`, chart accent neutralised; mover card 420→480px / 52→56%. Brand Ad fallback copy → factual. One combined trust line (still carries the marketplace chip). |
| `lib/social/videoDocument.mjs` | `.vhook` 70→78px + `max-height:3.2em`. Deal card `flex-basis`/`--cah` 430→560px, `max-width` 66→74%. `.vmetric` 132→64px. Market Mover `acc` → `C.inkSub`, `.vmetric` 150→104px / `C.ink`. Brand fallback copy → factual. |
| `lib/social/creativeQa.mjs` | **new** — deterministic density / quality heuristic + Impeccable category grades. |
| `lib/social/backgroundQuality.mjs` | **new** — background style ranking + first-live eligibility. |
| `scripts/socialCreativeQuality.mjs` | **new** — `npm run social:creative-quality` review pack. |
| `tests/scanner/social-creative-quality-13e11a.test.mjs` | **new** — E1 layout-parity, card occupancy, line-count, CTA, no-urgency, no-eBay-CTA, Mover neutrality, weak-background exclusion, no network. |

Nothing published. Nothing scheduled. No eBay Browse call. No Buffer
mutation. Quota waiter untouched.
