# Social Creative Design System — Phase 13E.3

**Status: static image system shipped.** Four reusable creative families,
one declarative composition spec, a dark premium renderer, self-hosted
type, and fail-closed guarantees for every real-data surface. No video, no
Reels/TikTok rendering, no scheduler, no publishing — `publishing` stays
`DISABLED`.

Builds on [`social-creative-system.md`](./social-creative-system.md) (13D),
[`social-daily-workflow.md`](./social-daily-workflow.md) (13E.1),
[`social-asset-library.md`](./social-asset-library.md) (13E.2 / storage
policy SS22), and [`social-card-artwork.md`](./social-card-artwork.md)
(13E.2.1 — real canonical card artwork, unchanged).

---

## 1. The structured creative spec — `lib/social/creativeSpec.mjs`

One declarative model every family inherits. Layout order, spacing, zone
geometry, card scale/rotation, safe margins, platform geometry, and the
dark visual tokens live **here** — never as ad-hoc numbers in the
renderer. `templates.mjs` is now a pure `(spec + verified payload) → HTML`
function.

| Concept | Where |
| --- | --- |
| **Platform targets** | `PLATFORM_TARGETS` — `ig_portrait` / `ig_carousel` / `paid_portrait` render (4:5, 1080×1350); `reel_9x16` / `tiktok_9x16` are **declared, not rendered** (`renders:false`) so a later phase drives video frames from the same spec |
| **Safe margins** | per target `safe: {top,right,bottom,left}` — no critical element enters them |
| **Zones** | `ZONES` — `brand · product · headline · metric · price · chart · screenshot · context · cta · disclosure` |
| **Compositions** | `COMPOSITIONS` — named layouts (`product_hero_split`, `product_stack`, `product_chart_split`, `hook_cover`, `hook_close`, `brand_ad`) with zone order + structural rule |
| **Card geometry** | `CARD_GEOMETRY` — scale clamped 0.7–1.0, `|rotation|` ≤ 4°, frame-only shadow. `resolveCardGeometry()` clamps every request |
| **Dark tokens** | `TOKENS` — `bg #0B0B0D`, one red accent `#F0322E`, green `#3FCF8E` **only** for a real positive metric, Geist type scale, 8px space scale |
| **Accent guard** | `resolveAccent({policy,discountPct,movement})` — returns a colour **only when the data supports the claim**; otherwise neutral, `allowed:false` |
| **Carousel sequencing** | `buildCarouselSequence(deals)` — deterministic: cover → one slide per deal (capped) → a fixed close slide. Same input ⇒ same order |

## 2. The four families

| Family | Purpose | Composition (A / B) | One-second read | Accent |
| --- | --- | --- | --- | --- |
| **Deal Drop** | one qualified click to a genuine live under-market listing | `product_hero_split` / `product_stack` | product → saving → price → CTA | green from real `discount_pct` |
| **Market Mover** | shareable market context — one real card's real price movement over a stated window | `product_chart_split` / `product_stack` | product → movement % → chart | green up / red down, **only** from `confidentTrendWindows` |
| **Hook Carousel** | stop scroll on slide 1, earn swipes, close on brand + CTA | cover → `product_hero_split` slides → close | the hook | green from real `discount_pct` |
| **Brand / Conversion Ad** | explain PokemonDealFinder fast | `brand_ad` (Version D) | the hook | none |

### 13E.3C corrections

- **Hook Carousel — distinct card identities.** `buildCarouselSequence()`
  never shows the same exact printing twice (dedupe by the P0.3-strict
  tcgplayer id, else a normalised `name|set`; an unidentifiable row is
  dropped), and prefers distinct Pokemon (a same-species / different-
  printing card is only a filler). Deterministic. It does **not** invent
  replacements: when there aren't enough distinct cards the carousel is
  **shorter**, `distinctCount` is the truthful number the cover hook
  states, and the cover's slide count equals the real content-slide
  count (`buildCoverSlideContent(payload, { distinctCount, totalSlides })`).
  The final close slide is unchanged.
- **Market Mover — the card is part of the identity.** A normal Market
  Mover creative **always** includes the real canonical card artwork
  alongside the real chart, in both variant A (card rail + chart) and
  variant B (card stacked above the chart). There is no deliberate
  chart-only variant. If the exact printing's artwork can't be resolved,
  `socialDaily` produces **no Market Mover post** (fail closed, same as a
  missing confident window); the renderer's no-card branch is a minimal
  identity + figure floor, never a shipped chart-only creative.

`contentTypes` map each existing daily content type onto a family
(`familyForContentType`). `deal_of_day` / `just_found` → Deal Drop;
`market_mover` → Market Mover; `pokemon_spotlight` / `set_spotlight` /
`best_deals_found_today` → Hook Carousel; `brand_ad` → Brand Ad.
`market_snapshot` keeps its own aggregate slide (no single printing).

## 3. Dark renderer — `lib/social/templates.mjs`

- **Dark premium ground** (`#0B0B0D`), one red accent, the real card
  supplies the rest of the colour.
- **Self-hosted Geist** (variable, weight 100–900) + Geist Mono, embedded
  base64 in `lib/social/fontData.mjs` (regenerate:
  `node scripts/_genSocialFontData.mjs`) — the same family the live site
  loads, with **no network fetch at render time**.
- **No eyebrow / kicker** above a headline (the heading carries its own
  weight).
- **Metric** = one large figure + an inline uppercase phrase — not a
  bordered tinted "hero-metric" panel.
- **Price** keeps the exact `LISTED (USD)` / `MARKET REF (USD)` labels,
  **no strikethrough** (the reference is dimmed + smaller, never a line
  through the digits), figures in tabular-nums; it renders as a
  full-width row below the split so the labels never wrap.
- **CTA** = a strong text line with an arrow and a red underline — never a
  filled tappable-looking button on a static image.
- **Context** = at most two quiet factual lines, including one plain-
  language "market ref — recent sold prices for this exact printing" so a
  cold viewer understands the comparison.
- **Card artwork (Layer 2)** unchanged from 13E.2.1: the exact matched
  printing, `object-fit:contain` (never cropped), frame-only rotation +
  shadow, **no filter on the pixels**, local `file://` only.

## 4. Market Mover — real movement or nothing (`lib/social/priceMovement.mjs`)

`resolveMovement({series, rows})` reuses **`lib/priceHistory.js`
unchanged** — the same merged canonical history + anomaly-confidence
checks the site's own card pages use. It returns `{ ok:true, pct, direction,
windowLabel, series }` **only** when:

- there are ≥ `MOVER_MIN_POINTS` (6) real observations, **and**
- a `confidentTrendWindows` window (30d preferred, then 90d / 7d / 12m)
  survives the endpoint-anomaly + source-disagreement checks, **and**
- its change is ≥ `MOVER_MIN_ABS_CHANGE_PCT` (8%).

Anything else → `{ ok:false, reason }`. `buildMoverPayload` **throws** if
handed a fail-closed result, so a Market Mover payload can never carry a
fabricated trend. In the renderer, an empty series drops the chart element
entirely and falls back to an identity + figure layout. The caption states
only the real movement over the stated window — "not investment advice",
no forecast, no "buy now".

## 5. Brand / Conversion Ad — Version D

`lib/social/brandAd.mjs` architecture, unchanged contract: OpenAI draws the
background environment **only**; the interface is a **real screenshot of
`https://pokemondealfinder.com`** in a deterministic CSS browser frame.
`resolveBrandScreenshot` fails closed (D not offered) when no real capture
is cached at `.social-preview/brand-ad/`. Hook: **STOP OVERPAYING FOR
POKEMON CARDS** (uppercase by CSS; ASCII "Pokemon" per the brand rule),
then a truthful one-liner about scanning eBay and comparing to a market
reference. No affiliation claim.

## 6. OpenAI backgrounds (Layer 1)

Prompt spec bumped to **`13e3-v1`** — every style clause now describes a
**premium-dark** ground (charcoal / near-black, one red accent, bright
white only as an accent). All 13E.2 guarantees unchanged: enum-only
`buildAssetPrompt({family,style,zone})`, `assertDataFree` at plan / test /
pre-wire, no card / creature / logo / text, reserved empty hero zone. The
first-pass **sample set (10)** is generated (dark); `auction_watch__B` was
re-rolled once. Nothing is approved — the 5-check human QA gate is
untouched.

## 7. Mobile / platform adaptability

The spec declares 9:16 targets (`reel_9x16`, `tiktok_9x16`) with their own
safe margins so a future phase renders Reels/TikTok frames from the same
family logic without touching it. 13E.3 renders portrait 4:5 only. All
type is sized for a feed-scale read: headline 44–140px, price 52px,
metric 68–140px, disclosure/context 22px on the 1080px canvas — every
element clears the mobile legibility floor at IG-feed display width.

## 8. Files

| File | Role |
| --- | --- |
| `lib/social/creativeSpec.mjs` | the structured composition model (NEW) |
| `lib/social/templates.mjs` | dark spec-driven renderer + the 4 family slide builders |
| `lib/social/fontData.mjs` | embedded Geist / Geist Mono base64 (NEW; regen script `scripts/_genSocialFontData.mjs`) |
| `lib/social/priceMovement.mjs` | Market Mover real-history gate, fail-closed (NEW) |
| `lib/social/payload.mjs` | `+ buildMoverPayload` (throws on a fail-closed movement) |
| `lib/social/caption.mjs` | `+ marketMover` assembler |
| `lib/social/dailyMix.mjs` | `MIX_FAMILIES` (pool-resolved) vs `DAILY_FAMILIES` (incl. `market-mover`, appended by socialDaily) |
| `lib/social/gallery.mjs` | review header now shows creative family · composition · one-second read |
| `scripts/socialDaily.mjs` | resolves + renders a Market Mover after the batch (one bounded `price_history` probe; fail closed) |
| `lib/social/assetPrompts.mjs` | spec `13e3-v1` — dark style clauses |
| `tests/scanner/social-creative-13e3.test.mjs` | the 13E.3 guarantee suite (NEW, 19 tests) |
| `tests/fixtures/social-deals.json` | real, currently-valid fixtures pulled from production (regen `scripts/_pullSocialFixtures.mjs`) |
