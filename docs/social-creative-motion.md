# SOCIAL-CREATIVE-3 — motion system (design only, NOT activated)

TikTok and YouTube Shorts reward motion. This is the design for a
newsroom motion layer. **Nothing here is built or wired.** No renderer,
no ffmpeg, no TikTok surface. `placementsForStory` still skips TikTok
entirely; YouTube is static-Short only.

## Principle

Motion is *earned reveal*, never decoration. Every frame is the static
card-forward composition we already render; motion only controls the
**order** the eye receives it in. No particles, no parallax drift, no
easing-for-its-own-sake. 5–8 seconds, silent-first (captions burned in),
loopable.

## Per-family storyboard

### `deal_hero` (6s)
1. 0.0–1.2s — real card slides up + settles (¾ → full size), eyebrow fades in.
2. 1.2–2.4s — card name + set type on.
3. 2.4–3.6s — market reference price types in (struck through).
4. 3.6–4.6s — **price counts down** from market → deal price, green.
5. 4.6–5.2s — "% below" pill snaps in.
6. 5.2–6.0s — CTA label fades; hold last frame for the loop.

### `bid_vs_total` (7s)
1. Card in. 2. "Winning bid $X" row. 3. "+ Shipping $Y" row drops below.
4. "+N% on top" flashes brand-red. 5. Landed-total block scales up from
the two rows merging. 6. Market-reference line fades under it. Hold.

### `three_up` (7s)
Cards deal in left→right (0.5s stagger); each price counts up to its
value as the card lands; aggregate "up to N% off" line wipes in last.

### `market_shape` (6s)
Big % counts up; distribution bar wipes left→right in one pass; featured
deal card slides in from the bottom on the last beat.

### `printing_compare` / `asking_vs_sold` (6s)
Two elements in sequence, then the multiple / the delta draws between
them. No simultaneous entrance — the contrast reads because one lands
before the other.

## Technical shape (when built)

- Frames are the **same HTML templates**, re-rendered at N keyframes with
  interpolated inline values, or CSS `@keyframes` captured via the
  existing CDP renderer at 30fps.
- Output: 1080×1920 H.264 + 1080×1350 for IG Reels crop-safe.
- Burned-in captions from the same caption builder; safe zones already in
  `CARD_TARGETS.short_916` (pad 96).
- Gate: a motion asset must pass the **static** QA of its final frame
  first; motion cannot rescue a WATCH still.

## Activation gate

Motion is a separate future phase and requires: (a) ≥ 5 autonomous-safe
static families, (b) an approved TikTok rights/compliance position (still
`NOT_PLATFORM_FIT` today), (c) a video renderer that reuses the CDP
pipeline. None are in place.
