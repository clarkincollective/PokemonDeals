# OpenAI Image-Generated Brand Asset Library — Phase 13E.2

**Status: architecture + prompt pack shipped; no images generated yet.**
No `OPENAI_API_KEY` is configured in this environment, so per the brief
(§19/§21) the generation step is built but not run, and no other image
provider is substituted.

The library gives the daily social feed an optional premium visual layer
of **evergreen, non-data-bearing backgrounds**. The existing deterministic
renderer still produces every real fact on top.

Section anchors (**§N**) match the code comments in
`lib/social/assetPrompts.mjs`, `lib/social/assets.mjs`,
`scripts/socialAssets.mjs`, and `scripts/socialDaily.mjs`.

---

## §0. The two commands

| Command | Calls OpenAI? | What it does |
| --- | --- | --- |
| `npm run social:assets` | **only** its `generate` subcommand, and only when `OPENAI_API_KEY` is set | Build/refresh the reusable asset library. Separate, occasional, human-gated. |
| `npm run social:daily` | **never** | Daily content run. Reads only *approved* local PNGs + the manifest. Zero image-generation calls (§18). |

`social:daily` does not import `assetPrompts.mjs`, `socialAssets.mjs`, or
any OpenAI code. It imports only `lib/social/assets.mjs`, a pure local
reader.

---

## §1. The data boundary (the load-bearing rule)

**Image generation receives ZERO live data.** Not a card name, Pokemon
name, set name, price, market reference, discount %, deal id, listing id,
listing title, seller name, search query, auction time, card-image URL,
PPT figure, or user/session identity.

This is enforced three ways:

1. **By construction.** `buildAssetPrompt()` accepts exactly three enum
   parameters — `{ family, style, zone }` — and throws on any other key.
   There is no parameter that could carry a datum.
2. **By guard.** `assertDataFree(prompt)` scans the finished string for
   price / percentage / grade / field-name / known-subject signatures and
   throws. It runs at plan time, in the test suite (over all 120
   family×style×zone combinations *and* over deliberately-poisoned
   strings), and again inside `generateImageB64()` immediately before the
   `fetch`.
3. **By isolation.** `assetPrompts.mjs` and `assets.mjs` contain no
   `fetch`, no `process.env`, no OpenAI import, and no import from the
   live-data layer (`db.mjs`, `candidates.mjs`, `dailyMix.mjs`,
   `payload.mjs`, `ebay.js`). Tested.

### §6. Where the real facts come from

The deterministic HTML renderer (`lib/social/templates.mjs`) overlays
**all** real, approved content — card name, `% UNDER MARKET REF`, `LISTED
(USD)`, `MARKET REF (USD)`, evidence chips, freshness line, CTA, the `Ad`
disclosure, and the `PokemonDealFinder` wordmark — on a translucent panel
above the generated background. The image model never sees any of it. A
generated asset is a **background only**.

---

## §2. Asset categories (10) — §1 of the brief

`deal_intelligence`, `just_found`, `market_watch`, `pokemon_watch`,
`set_watch`, `raw_vs_graded`, `auction_watch`, `collector_education`,
`trust_verification`, `search_discovery`.

Each has a distinct **motif clause** in `assetPrompts.mjs` (e.g. Deal
Intelligence = "a single blank card catching light, sitting below an
implied reference line, a thin bracket suggesting a gap"; Pokemon Watch =
"a small cluster of blank cards held by a focus ring, a line-art
magnifying glass" — **no creature, no silhouette**).

## §9. Style families (4)

`clean_editorial` · `dark_market_intelligence` · `collector_desk` ·
`abstract_market`. Applied so the 30 assets are visually varied rather
than one repeated template.

## §8. Composition zones (5) + safe-zone geometry

| Zone | Reserved empty region (on the 1080×1350 canvas) |
| --- | --- |
| `A` TOP TEXT | upper ~460 px |
| `B` LEFT TEXT | left ~560 px column |
| `C` CENTER METRIC | centred band y≈360–980 |
| `D` LOWER EVIDENCE | lower two-fifths, y≈800↓ |
| `E` FULL-BLEED EDITORIAL | only slim top (150 px) + bottom (170 px) strips |

Every manifest entry stores `safe_zones` as `{ zone, name, clear: [[x,y,w,h]…], text: {headline, metric, footer} }` so overlay placement is
data, not eyeballing.

## §7 / §20. The prompt pack

`lib/social/assetPrompts.mjs` is the single deterministic prompt spec.
`buildAssetPrompt({family, style, zone})` composes: shared intro → style
clause → family motif → composition/zone clause → brand-palette clause →
composition constraints → **"NO TEXT of any kind rendered inside the
image"** → the full IP/brand prohibition (`SHARED_NEGATIVE`).

`SHARED_NEGATIVE` (verbatim in every prompt) forbids: any Poké Ball or
band-sphere shape; the Pokemon logo/wordmark; any Pokemon creature,
character, or recognizable silhouette; Nintendo / The Pokemon Company /
Game Freak / PSA / BGS / CGC / TCGplayer / eBay branding; any real
trading-card artwork; any real or fabricated card name, set symbol,
rarity mark, or energy symbol; readable text, letterforms, numbers,
watermarks, signatures, UI chrome; photos of real people or merchandise;
QR codes. Generic card-like objects are allowed **only** as clearly
original blank forms with no readable markings.

The fully-expanded prompts are written to `.social-preview/asset-prompts/`
(git-ignored) by `npm run social:assets` — the repo is public, so the
expanded dump is not committed (§13); the structured spec in
`assetPrompts.mjs` is.

---

## §7 / §21. Master pack & sample

- **Plan:** 3 variants × 10 categories = **30** reusable base assets.
- **First pass (sample):** 2 variants each of Deal Intelligence, Just
  Found, Market Watch, Pokemon Watch, Set Watch = **10**. Marked
  `"sample": true` in the manifest. Do not generate the remaining 20 until
  the sample 10 are visually approved.

Render size `1024x1536` (closest portrait the API offers to 4:5); the
renderer treats it as a 1080×1350 background.

---

## §13. Storage & manifest

```
assets/social/generated/
  social-assets.json            the manifest (committed)
  <category>/<id>.png           an approved/generated asset (created by social:assets)
```

`social-assets.json` top level: `spec_version`, `generator`, `updated`,
`boundary` (the data-free statement), `qa_checks`, `status_values`,
`counts`, and `assets[]`.

Each `assets[]` entry:

```jsonc
{
  "id": "deal_intelligence__A",
  "category": "deal_intelligence",
  "variant": "A",
  "sample": true,
  "style": "abstract_market",
  "zone": "C",
  "aspect_ratio": "4:5",
  "render_size": "1024x1536",
  "composition": "CENTER METRIC ZONE",
  "safe_zones": { "zone": "C", "name": "CENTER METRIC ZONE", "clear": [[80,360,920,620]], "text": {…} },
  "status": "planned",          // planned -> generated -> approved | rejected
  "file": null,                 // repo-relative PNG path once generated
  "prompt_spec_version": "13e2-v1",
  "generated_date": null,
  "approved_date": null,
  "qa": null,                   // { generated_background: PASS|REJECT, copyright_risk, brand_fit, text_legibility, ai_artifact }
  "notes": ""
}
```

The committed manifest currently holds **30 `planned` entries, 0
generated, 0 approved**.

---

## §12 / §17. Quality gate & human review

`generate` only ever sets `status: "generated"` and `qa: {all PENDING}`.
A human must:

1. Inspect the PNG (in the daily gallery, or by eye).
2. Record the **5 checks** — all must be `PASS`:
   `generated_background`, `copyright_risk`, `brand_fit`,
   `text_legibility`, `ai_artifact`.
   `npm run social:assets -- qa <id> copyright_risk=PASS brand_fit=PASS …`
3. `npm run social:assets -- approve <id>` — refused unless all 5 are
   `PASS`, the file exists, and the entry validates.

Reject anything questionable (`… -- reject <id>`) and regenerate rather
than hand-patch (`… -- generate --family <cat> --force`).

Only `status: "approved"` + all-QA-`PASS` + file-on-disk assets ever enter
`social:daily` rotation (`approvedAssetsForCategory`).

---

## §14. Daily-workflow integration

In `renderCandidate` (`scripts/socialDaily.mjs`):

- **Version A** — the current deterministic Mode-B creative
  (`creative-A.png` / `creative-B.png`). Unchanged.
- **Version B** — the *same* deterministic overlay rendered over an
  approved background (`creative-enhanced-A.png` / `-B.png`), **only if**
  `resolveBackgroundForPost()` returns one for that family and the PNG is
  on disk. Metadata written to `asset.json`.

Content-family → asset-category (`ASSET_CATEGORY_FOR_CONTENT_TYPE`):

| daily family | asset category |
| --- | --- |
| `deal_of_day` | `deal_intelligence` |
| `just_found` | `just_found` |
| `pokemon_spotlight` | `pokemon_watch` |
| `set_spotlight` | `set_watch` |
| `market_snapshot` | `market_watch` |

### Deterministic rotation (§14)

`pickAssetForContentType(contentType, { manifest, rotationKey })`:
`rotationKey` = the post's generation date (`YYYY-MM-DD`). Index =
`fnv1a("<category>:<rotationKey>") % candidates.length` over the
id-sorted approved set. Same content type + same day → same asset every
run. Rotates day to day. No randomness, no per-run drift.

---

## §15. Fallback

If no approved asset exists, the file is missing, or the manifest is
invalid → **Version B is simply not produced** and Version A (Mode B)
stands. `social:daily` never fails because of the asset library. Every
guard in `lib/social/assets.mjs` returns `null`/`[]` on any problem.

---

## §16 / §17. A/B review

The daily gallery (`lib/social/gallery.mjs`) shows **A and B side by
side** when a B exists, labelled and with the source asset id. Below the
auto-checks it adds a **Generated-background review** block: the 5
PASS/REJECT toggles plus a "PUBLISH WHICH VERSION? A / B" pick, stored in
`localStorage` only. The AI-enhanced version is **never** auto-preferred;
the owner chooses. Publishing stays manual and disabled.

---

## §11 / §19. API & secret handling

- The OpenAI call exists in exactly one place: `generateImageB64()` in
  `scripts/socialAssets.mjs`, a `fetch` to
  `https://api.openai.com/v1/images/generations` (`model: gpt-image-1`,
  `size: 1024x1536`). No SDK dependency added.
- The key is read from `process.env.OPENAI_API_KEY` only — never a file,
  never a prompt, never a CLI arg. It is never logged, never written to
  the manifest or any generated file. On API error only the API's own
  response text is surfaced, never the request headers.
- Client/browser code never touches it.
- With no key configured, `generate` prints that the architecture + prompt
  pack are ready and exits 0 — it does **not** prompt for a secret.

No GenAI **text** provider is imported or called anywhere. `social:daily`,
`social:preview`, and all of `lib/social/*` are free of any OpenAI/LLM
call (tested).

---

## Files

| File | Role |
| --- | --- |
| `lib/social/assetPrompts.mjs` | Prompt pack: families, styles, zones, safe-zone geometry, `buildAssetPrompt`, `assertDataFree`, `expandPlan`. Pure, data-free. |
| `lib/social/assets.mjs` | Manifest loader, entry validation, deterministic approved-only selector, `resolveBackgroundForPost`. Pure local reads. |
| `scripts/socialAssets.mjs` | `npm run social:assets` — plan / generate (the only OpenAI call) / qa / approve / reject / status. |
| `scripts/socialDaily.mjs` | Integrates the approved-background Version B; unchanged Mode-B Version A; console + gallery. |
| `lib/social/templates.mjs` | `renderHtml(slide, { variant, background })` — optional data-free background behind the full deterministic overlay. |
| `lib/social/gallery.mjs` | A/B side-by-side + the 5-check generated-background review block. |
| `assets/social/generated/social-assets.json` | The manifest (30 planned). |
| `tests/scanner/social-asset-library.test.mjs` | The test suite (brief §22). |
