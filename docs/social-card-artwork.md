# Real Card Artwork Compositing + OpenAI Pipeline Correction — Phase 13E.2.1

**Status: architecture + real-card rendering shipped. No images generated
(no `OPENAI_API_KEY`).** Builds directly on
[`docs/social-asset-library.md`](./social-asset-library.md) (13E.2) — that
pipeline is reused, not rebuilt.

The social creative now has a **three-layer** architecture:

```
LAYER 1  background        deterministic Mode-B ground, OR an approved
                           data-free OpenAI background (13E.2)
LAYER 2  real card artwork  the ACTUAL matched printing's canonical
                           TCGplayer catalogue image, composited by the
                           deterministic renderer (NOT the model)
LAYER 3  facts / brand      card name, %, prices, freshness, CTA,
                           PokemonDealFinder wordmark, Ad disclosure -
                           100% deterministic overlay
=  FINAL 1080×1350 social creative
```

---

## 1. Card-rights update

`lib/social/rights.mjs` — `card_image` flipped `NOT_CLEARED → CLEARED`
(owner-confirmed, 2026-09-06). The other four capabilities are unchanged
and tracked separately:

| capability | state | note |
| --- | --- | --- |
| `ppt_social_data` | CLEARED | 13E.1 |
| **`card_image`** | **CLEARED** | **13E.2.1 — real canonical catalogue artwork only** |
| `ebay_seller_images` | NOT_CLEARED | seller photos are still NEVER composited — separate clearance |
| `ebay_genai` | NOT_ALLOWED | no EPN AI Tools approval |
| `publishing` | DISABLED | no publish path; manual only |

`card_image = CLEARED` does **not** imply generated card replicas,
invented Pokemon, a species-level generic image, or eBay seller photos.

---

## 3. Canonical image source

**TCGplayer product CDN** — `https://tcgplayer-cdn.tcgplayer.com/product/<tcgplayer_id>_in_1000x1000.jpg` — the same artwork the website already
renders for that exact `card_catalog` row (`lib/cardImage.js`
`catalogImageUrl` / `upgradeCatalogImage`).

Never used: `deals.image_url` (the eBay **seller** photo), Google Images,
scraped media, AI-generated replicas.

---

## 4. Exact-printing integrity (`lib/social/cardArtwork.mjs`)

Every active `deals` row carries `card_tcgplayer_id`, set by the
P0.3-strict scanner match — the exact-printing key. Version C uses **only**
that id; it never derives an image from a species name.

`printingMatch(deal, catalogRow)` PASSES only when:

1. `deal.card_tcgplayer_id` is present and numeric;
2. the resolved URL is on `tcgplayer-cdn.tcgplayer.com` and its
   `/product/<id>` matches `deal.card_tcgplayer_id`;
3. it is not an eBay host;
4. when a `card_catalog` row is supplied (it is, in `social:daily` — one
   batched read for only the day's selected ids): the row is for the same
   id, has a canonical `image_url`, and its `name` / `set` reconcile with
   the deal's identity.

**Any failure ⇒ Version C is not produced and Mode B (A/B) stands.** A
wrong-print image, a missing image, missing rights, a download failure, or
a duplicate printing in a multi-card set all fail closed. P0.3 identity
protections are untouched — this module only *consumes* the id the scanner
already committed to.

---

## 5. The three-layer renderer (`lib/social/templates.mjs`)

`renderHtml(slide, { variant, background, cardArtwork, brandAd })`:

- `cardArtwork = null` → Versions A / B, **no `<img>`** (unchanged).
- `cardArtwork` set → `renderCardHeroSlide` (Version C). The `<img class="card-art">` src is always a **local `file://`** path to a cached
  canonical image. `object-fit: contain` guarantees the whole card shows,
  aspect preserved, **no crop through the border**. Deterministic frame
  effects only — `drop-shadow`, a ≤2.5° rotation on hero layouts — **never**
  a filter on the pixels (`blur` / `hue-rotate` / `saturate` / `sepia` /
  `grayscale` / `contrast` are all absent from `.card-art`). No AI redraw,
  replacement, or style transfer anywhere.
- `brandAd` set → `renderBrandAdSlide` (Version D).

### Card hero presentations (SS8)

`CARD_PRESENTATIONS = [hero_left, hero_right, center_card, card_metric_panel, multi_card]`. v1 renders three real single-card layouts
(`hero_left`/`hero_right`/`card_metric_panel` share a split; `center_card`
is the stacked hero) plus `multi_card` (a 2–4 card strip). Per family:

| family | presentation |
| --- | --- |
| deal_of_day | card_metric_panel |
| just_found | center_card |
| pokemon_spotlight / set_spotlight | multi_card (2–4 distinct real printings) |
| market_snapshot | *(no Version C — aggregate view, SS13)* |

---

## 6. OpenAI never receives card artwork — proof

- `buildAssetPrompt({ family, style, zone })` takes three enums and throws
  on any other key. There is no parameter that could carry a card image,
  URL, name, set, price, or id.
- `assertDataFree()` (run at plan time, in tests over all 120
  family×style×zone combos + poisoned strings, and immediately before the
  API `fetch`) now also rejects: any `http(s)` URL, `tcgplayer-cdn` /
  `/product/<id>`, `.jpg`/`.png`/`.webp`, `file://`, `card-art-cache`,
  `card_tcgplayer_id`.
- `lib/social/assetPrompts.mjs` and `scripts/socialAssets.mjs` do **not**
  import `lib/social/cardArtwork.mjs`. The generator has no code path to
  Layer 2.
- `lib/social/cardArtwork.mjs` imports no OpenAI code; its only outbound
  call is a host-locked `https.get` to `tcgplayer-cdn.tcgplayer.com`.

---

## 7. Background-prompt correction (SS7)

The earlier "ask the model to make the whole ad" experiment produced fake
Pokemon / fake cards. Every background prompt now (spec `13e2.1-v1`):

- carries an **ABSOLUTE RULES** block: *DO NOT DRAW A TRADING CARD / CARD
  ARTWORK / CREATURES / POKEMON-LIKE CHARACTERS / A CARD IN THE RESERVED
  HERO ZONE*;
- reserves an explicit **empty hero zone** ("a real product image is
  composited into that space afterwards");
- motifs rewritten to drop every blank-card / slab / rounded-rectangle
  focal element — now lighting, geometry, chart marks, a magnifying glass,
  desk textures only;
- `SHARED_NEGATIVE` extended: no card / blank card / silhouette / slab /
  sleeve-with-card / rectangle-standing-in-for-a-card *anywhere*.

---

## 8. OpenAI model (SS15)

Single source of truth: `lib/social/imageModelConfig.mjs`.

| constant | value | source |
| --- | --- | --- |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | current SOTA per [developers.openai.com/api/docs/guides/image-generation](https://developers.openai.com/api/docs/guides/image-generation), audited 2026-09-06 (supersedes `gpt-image-1`) |
| `OPENAI_IMAGE_REQUEST_SIZE` | `1024x1536` | standard portrait for gpt-image-2 |
| `OPENAI_IMAGE_MODEL_PREVIOUS` | `gpt-image-1` | for a one-word env rollback |

`scripts/socialAssets.mjs` is the only consumer; `OPENAI_IMAGE_MODEL` env
var overrides for a pinned rollback. The model string appears in **no
other file**.

---

## 9. Version A / B / C / D

| version | what | availability |
| --- | --- | --- |
| **A** | deterministic Mode B | always |
| **B** | A over an approved data-free OpenAI background | when one is in rotation (needs `social:assets` + a key) |
| **C** | A/B + real canonical card artwork | when `card_image=CLEARED` **and** the exact printing verifies; else fails closed |
| **D** | brand ad: background + a REAL `pokemondealfinder.com` screenshot in a deterministic browser frame | architecture ready; only rendered when a real screenshot is cached — capture is a deliberate, separate step, never in the daily loop |

The review gallery shows only the versions that exist, side by side, with
an **A/B/C/D publish picker** that is never auto-set. Version C carries an
**image-rights panel** (SS19): `CARD IMAGE` state, `SOURCE` (TCGplayer
product CDN), `PRINTING MATCH` PASS/FAIL + reason.

Version D (`lib/social/brandAd.mjs`): OpenAI generates the background
environment **only** — never the site UI, a phone, listings, prices,
cards, or text. `resolveBrandScreenshot` fails closed (D not offered) when
no real screenshot is cached.

---

## 10. Card-image caching (SS20)

- **No catalogue-wide download, ever.** `social:daily` collects the
  `card_tcgplayer_id`s of *only the day's selected candidates* (≤ ~25),
  does **one batched** `card_catalog` read for the cross-check
  (`fetchCatalogRows`), and downloads each image **once** to
  `.social-preview/card-art-cache/<tcgplayer_id>.jpg`.
- Subsequent runs reuse the cache — a cached, non-empty file is never
  re-fetched.
- `.social-preview/` is gitignored, so the cache is never committed.

---

## 14. Seller-image evidence stays separate

Canonical artwork = **identity / reference display**. eBay seller image =
**evidence of the actual listed item** — still `NOT_CLEARED`, still a
separate pending P1, untouched here. `resolveCardArtwork` refuses to run
if `ebay_seller_images` ever flips to CLEARED without a re-check.

---

## Files

| file | role |
| --- | --- |
| `lib/social/rights.mjs` | `card_image: CLEARED` |
| `lib/social/cardArtwork.mjs` | canonical URL resolution, `printingMatch`, fail-closed `resolveCardArtwork` / `resolveMultiCardArtwork`, host-locked cached download |
| `lib/social/brandAd.mjs` | Version D architecture + `resolveBrandScreenshot` |
| `lib/social/imageModelConfig.mjs` | the GPT Image model + size, single source of truth |
| `lib/social/templates.mjs` | `renderCardHeroSlide`, `renderBrandAdSlide`, Layer-2 CSS (contain, no pixel filters) |
| `lib/social/assetPrompts.mjs` | spec `13e2.1-v1`: no-card-drawing rules, empty hero zone, extended `assertDataFree` |
| `lib/social/db.mjs` | `fetchCatalogRows(ids)` — one bounded read for the cross-check |
| `lib/social/gallery.mjs` | A/B/C/D media block, image-rights panel, A/B/C/D publish picker |
| `scripts/socialDaily.mjs` | Version C/D wiring; still zero OpenAI calls |
| `scripts/socialAssets.mjs` | model from `imageModelConfig`; "OPENAI API READY — KEY REQUIRED" |
| `tests/scanner/social-card-artwork.test.mjs` | the 13E.2.1 test suite |

---

## Activation

The only remaining blocker for generated backgrounds (Version B) and any
future generation is **`OPENAI_API_KEY`** — set it server/local (never
commit, never paste in chat) and run `npm run social:assets -- generate
--sample`. Version C (real card artwork) needs **no key** and is live now.
