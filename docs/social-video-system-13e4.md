# Social short-form VIDEO system (Phase 13E.4)

Deterministic vertical video (Instagram Reels / TikTok) built on top of the
frozen 13E.3D static creative system. Nothing here publishes, schedules, or
calls a model. No copyrighted audio — the video carries no audio track at
all and is designed to be fully legible sound-off.

## Master format

| | |
|---|---|
| Canvas | **1080 × 1920** (9:16) |
| Frame rate | **30 fps**, constant |
| Codec | **H.264** (`libx264`, high profile, level 4.0), `yuv420p`, `+faststart` |
| Audio | **none** (a later phase can add a safe bed / VO onto `timeline.audio.cues`) |
| Safe area | one MASTER rectangle = the **union** of the reel and tiktok chrome-safe insets (`SHARED_SAFE` in `lib/social/videoTimeline.mjs`). One master serves both platforms; only the *reported* `platformSafe` differs. |

## Pipeline

```
verified 13E.3D payload  (hook engine / resolveCta / content_goal / real card art)
  -> lib/social/videoTimeline.mjs   buildVideoTimeline()  -> structured, data-only timeline
  -> lib/social/videoDocument.mjs   renderVideoHtml()      -> one animated, self-contained HTML doc
  -> lib/social/videoRender.mjs     renderTimelineToMp4()  -> headless Chrome, frame-by-frame, ffmpeg encode
  -> lib/social/videoCaption.mjs    buildVideoCaptions()   -> IG + TikTok caption drafts
  -> lib/social/videoQa.mjs         runVideoQa()           -> fail-closed QA gate
```

Entry point: **`npm run social:video`** (`scripts/socialVideo.mjs`) — selects
content from `tests/fixtures/social-deals.json`, resolves real canonical
card artwork + an approved OpenAI background, renders every family for reel
+ tiktok, drafts captions, runs QA, and writes a local review bundle to
`.social-preview/13e4/`. It never publishes.

## Deterministic motion

`videoRender.mjs` loads the document into headless Chrome once
(`Page.setDocumentContent`), then for each frame pauses **every** CSS
animation and seeks it to an exact time with the Web Animations API
(`getAnimations().forEach(a => { a.pause(); a.currentTime = t })`), forces a
style/layout flush, and screenshots. The same timeline always produces
byte-identical motion, and it sidesteps the virtual-time protocol stalls
headless Chrome hits on heavier composited pages.

The document is **fully self-contained** before it reaches Chrome: fonts
are base64 `@font-face`, and the card artwork / approved background / site
screenshot are inlined as `data:` URIs (`inlineLocalAssets()` in
`videoDocument.mjs`). There are no `file://` subresources and zero network
fetches at render time.

The motion language is a small fixed set of CSS `@keyframes`
(`v-mask-up`, `v-rise`, `v-scale-in`, `v-slide-up`, `v-slide-right`,
`v-fade`, `v-pop`, `v-draw`, `v-scene`, `v-drift`) driven purely by
per-element `animation-delay` / `-duration` in ms that map 1:1 onto the
seek clock. The Market Mover chart is drawn by animating `stroke-dashoffset`
over the **exact** real price path — no invented endpoint, peak, or value.

## Families

| Family | Duration | First second | Notes |
|---|---|---|---|
| `deal_drop` | 8s | the hook (data-driven; `%` in the hook ⇒ hero shows `$` saved, and vice-versa, never both) | real card art, LISTED vs MARKET REF, website-first CTA |
| `market_mover` | 10s | card identity + the real confident move % | requires BOTH real canonical artwork AND a confident real history — fails closed otherwise |
| `hook_carousel` | dynamic (hook 3.6s + 2.2s/card + close 2.6s) | the truthful count hook | one scene per **distinct printing**; cover fans 2–3 of the carousel's own real cards |
| `brand_ad` | 10s | `Stop overpaying for Pokemon cards` (fixed, claim-free) | large real site screenshot (~55%), ≤3 supported benefits |

Every family keeps the freshness/`Ad` disclosure on screen throughout and
ends on a CTA that points back to a **real** PokemonDealFinder route
(`resolveCta()` / the payload's own destination — never fabricated, never
"See it on eBay").

## The QA gate (`runVideoQa`, fails closed)

Checks, among others: valid MP4 · H.264 / yuv420p · 1080×1920 · 9:16 ·
30fps · no audio · duration & frame count match the timeline · ≥3 scenes,
hook first, CTA after the hook · safe rectangle **is** the shared union ·
13E.3D identifiers carried verbatim (`…-vid-<platform>`) · `content_goal`
in the enum · deal hook / metric / listed / reference copied from the
payload with no drift · CTA on-site and matching the payload route ·
disclosure + freshness present · Market Mover has real card **and** ≥6
confident history points with matching endpoints · carousel count matches
the scene count with no duplicate printing · card images are local/canonical
(never a seller CDN) · background is an approved-asset id only · captions
carry the disclosure and never an eBay CTA · **never publishes**.

## Identifiers & captions

The timeline carries the 13E.3D identifiers unchanged except for a
`-vid-<platform>` suffix on `content_id`. `buildVideoCaptions()` reuses the
approved static assembler (`lib/social/caption.mjs`) as the factual spine
and only prepends a short, claim-free opener chosen by `content_goal`;
hashtags come from `buildHashtags()`. `brand_ad` has no static assembler,
so its caption body is fixed brand prose + the same disclosure line.

## Review bundle

`node scripts/_videoReviewPack13e4.mjs` reads `.social-preview/13e4/` and
writes `.social-preview/13e4-review-pack/` — the final MP4s (reel +
tiktok), a labelled `contact-sheet.png` of representative frames, and
`manifest.json` / `manifest.txt` (content_id, family, hook, CTA, duration,
format, fixture ids, background id, QA result).

## What is out of scope for 13E.4

No distribution, scheduler, Buffer / Instagram / TikTok / Reddit
integration, or auto-publishing. No OpenAI video or new image generation.
No audio.
