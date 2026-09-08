// Phase SOCIAL-CREATIVE-4C - MOTION LANGUAGE (§7) + ANTI-SLIDESHOW RULES.
//
// VIDEO MUST BE MOTION-NATIVE. Not "static image + slow zoom", not a
// template slideshow, not PowerPoint. This module is the deterministic
// vocabulary of approved motions, the banned list, and the constraints
// the pacing auditor (§23) enforces.
//
// Pure data. No I/O, no OpenAI.

export const MOTION_LANGUAGE_VERSION = "4c.1";

// §7 - approved motion primitives. `kind` groups them for the pacing audit
// ("is this scene doing real motion work, or just holding?").
export const APPROVED_MOTIONS = Object.freeze({
  card_slide_reveal:   { kind: "card", desc: "a real card slides / masks into frame" },
  crop_detail_reveal:  { kind: "card", desc: "the frame pushes into a real detail of the card" },
  stamp_variant_zoom:  { kind: "card", desc: "zoom onto a stamp / set symbol / variant marker" },
  number_count_up:     { kind: "data", desc: "a value counts up to its real figure" },
  price_compare_move:  { kind: "data", desc: "two real prices move together / apart to show the gap" },
  bar_growth:          { kind: "data", desc: "a bar grows to its real proportion" },
  range_reveal:        { kind: "data", desc: "a range / spread draws out between two real endpoints" },
  chart_draw:          { kind: "data", desc: "a distribution / line draws on over time" },
  pointer_callout:     { kind: "emphasis", desc: "a pointer / callout animates to a real element" },
  mask_reveal:         { kind: "emphasis", desc: "a wipe / mask reveals the next beat" },
  parallax_depth:      { kind: "depth", desc: "subtle multi-layer depth on entrance only" },
  editorial_wipe:      { kind: "transition", desc: "a clean editorial wipe between scenes" },
  typographic_emphasis:{ kind: "type", desc: "a word / figure scales or weights up for emphasis" },
  kinetic_caption:     { kind: "type", desc: "short on-screen text animates in beat-synced" },
});
export const APPROVED_MOTION_KEYS = Object.freeze(Object.keys(APPROVED_MOTIONS));

// §7 - explicitly banned. The pacing / motion-quality audits reject these.
export const BANNED_MOTIONS = Object.freeze([
  "random_spin", "constant_zoom", "ken_burns", "slow_pan", "excessive_bounce",
  "gaming_hud", "glitch_spam", "fake_3d", "meme_transition", "logo_intro",
  "static_hold", "slideshow",
]);

// §7 / §23 - anti-slideshow constraints the pacing auditor enforces.
export const ANTI_SLIDESHOW = Object.freeze({
  // the hook must communicate a reason to keep watching inside this window
  hook_must_land_by_ms: 1000,
  // no single scene may just hold with no approved motion for longer than this
  max_dead_hold_ms: 1400,
  // at least this fraction of scenes must carry a `data`- or `card`-kind motion
  min_active_scene_ratio: 0.6,
  // a scene shorter than this is a cut, not a beat (too choppy)
  min_scene_ms: 700,
  // a scene longer than this must contain sustained motion, not a hold
  max_scene_ms: 6000,
  // no logo / brand splash may occupy frame before this
  brand_splash_forbidden_before_ms: 99999, // i.e. never lead with a logo animation
  // the whole piece must have at least this many distinct scenes
  min_scenes: 4,
});

export function isApprovedMotion(m) {
  return APPROVED_MOTION_KEYS.includes(String(m || ""));
}
export function isBannedMotion(m) {
  return BANNED_MOTIONS.includes(String(m || "").toLowerCase().replace(/[\s-]+/g, "_"));
}
export function motionKind(m) {
  return APPROVED_MOTIONS[m]?.kind ?? null;
}
