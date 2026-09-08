// Phase SOCIAL-CREATIVE-4B.1 - DETERMINISTIC TEXT-FIT / LAYOUT ENGINE (§9).
//
// The renderer has no browser measure pass, so this estimates rendered
// width from a Geist advance-width table and picks a font size that FITS a
// given box - no hero number ever runs off canvas, no saving label ever
// clips. It also exposes assertNoClip() for the freeform composition
// validator (§16).
//
// Pure. No I/O, no fonts loaded - just metrics.

// Per-glyph advance as a fraction of font size, for Geist / Geist-like
// grotesques at weight 700-800. Digits are tabular (equal width). This is
// an ESTIMATE tuned to over-, not under-, predict width (fail safe).
const W = {
  " ": 0.30, ".": 0.32, ",": 0.32, "'": 0.26, "-": 0.38, "–": 0.55, "—": 1.0,
  "$": 0.64, "%": 1.02, "&": 0.82, "/": 0.44, "+": 0.64, "=": 0.64, "×": 0.66,
  "0": 0.62, "1": 0.62, "2": 0.62, "3": 0.62, "4": 0.62, "5": 0.62, "6": 0.62, "7": 0.62, "8": 0.62, "9": 0.62,
  i: 0.30, j: 0.32, l: 0.30, f: 0.38, t: 0.40, r: 0.44, I: 0.36,
  m: 0.96, w: 0.88, M: 1.00, W: 1.06,
};
const DEFAULT_LOWER = 0.58; // a-z average (grotesque, 700-800 weight)
const DEFAULT_UPPER = 0.74; // A-Z average

// The metrics under-predict for heavy weights; multiply the estimate by a
// safety margin so fitText always errs toward a SMALLER font (no clip).
const SAFETY = 1.07;

export function charWidthRatio(ch) {
  if (ch in W) return W[ch];
  if (ch >= "a" && ch <= "z") return DEFAULT_LOWER;
  if (ch >= "A" && ch <= "Z") return DEFAULT_UPPER;
  return 0.66;
}

// Estimated rendered width (px) of `text` at `fontPx`, applying a
// letter-spacing (em) if given. Uppercased tracking (label style) widens.
export function measureText(text, fontPx, { tracking = 0 } = {}) {
  const s = String(text ?? "");
  let ratio = 0;
  for (const ch of s) ratio += charWidthRatio(ch);
  const spacing = tracking * Math.max(0, s.length - 1); // em per gap
  return Math.ceil((ratio + spacing) * fontPx * SAFETY);
}

// Wrap `text` to at most `boxW` px at `fontPx`, greedily by word. Returns
// { lines:[..], widest, lineCount }.
export function wrapText(text, fontPx, boxW, { tracking = 0 } = {}) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (measureText(trial, fontPx, { tracking }) <= boxW || !cur) cur = trial;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  const widest = Math.max(0, ...lines.map((l) => measureText(l, fontPx, { tracking })));
  return { lines: lines.length ? lines : [""], widest, lineCount: lines.length || 1 };
}

/**
 * Pick the largest font size in [minPx, maxPx] at which `text` fits
 * `{ boxW, boxH }` within `maxLines`. Returns
 *   { px, lines, lineCount, widest, fits, reflowed }
 * `fits:false` means even at minPx it overflows (the caller must move /
 * resize the zone).
 */
export function fitText(text, { boxW, boxH = Infinity, minPx = 16, maxPx = 160, maxLines = 1, lineHeight = 1.05, tracking = 0, step = 2 } = {}) {
  const s = String(text ?? "");
  for (let px = Math.floor(maxPx); px >= minPx; px -= step) {
    if (maxLines <= 1) {
      const w = measureText(s, px, { tracking });
      if (w <= boxW && px * lineHeight <= boxH) return { px, lines: [s], lineCount: 1, widest: w, fits: true, reflowed: false };
    } else {
      const { lines, widest, lineCount } = wrapText(s, px, boxW, { tracking });
      if (lineCount <= maxLines && widest <= boxW && lineCount * px * lineHeight <= boxH) {
        return { px, lines, lineCount, widest, fits: true, reflowed: lineCount > 1 };
      }
    }
  }
  // does not fit even at minPx - return the min with the honest flag
  const { lines, widest, lineCount } = maxLines > 1 ? wrapText(s, minPx, boxW, { tracking }) : { lines: [s], widest: measureText(s, minPx, { tracking }), lineCount: 1 };
  return { px: minPx, lines, lineCount, widest, fits: false, reflowed: false };
}

// Convenience for a money hero number: size $X so it fits `boxW`, never
// below `minPx`, wrapping is NOT allowed (a price is one token).
export function fitHeroNumber(text, boxW, { minPx = 48, maxPx = 160, tracking = -0.03 } = {}) {
  return fitText(text, { boxW, minPx, maxPx, maxLines: 1, tracking });
}

// §16 - assert no zone's text content overflows its box. `zones` =
// [{ role, text, x, y, w, h, fontPx, maxLines?, tracking? }]. Returns
// { ok, clipped:[{ role, need, have }] }.
export function assertNoClip(zones = []) {
  const clipped = [];
  for (const z of zones) {
    if (z.text == null || !z.fontPx) continue;
    const maxLines = z.maxLines ?? 1;
    const fit = fitText(String(z.text), { boxW: z.w, boxH: z.h ?? Infinity, minPx: z.fontPx, maxPx: z.fontPx, maxLines, tracking: z.tracking ?? 0, step: 1 });
    if (!fit.fits) clipped.push({ role: z.role, need: fit.widest, have: z.w, text: String(z.text).slice(0, 40) });
    if (z.x != null && z.w != null && (z.x < 0 || z.x + z.w > (z.canvasW ?? 1080))) clipped.push({ role: z.role, reason: "zone extends past canvas x", x: z.x, w: z.w });
  }
  return { ok: clipped.length === 0, clipped };
}

export const TEXT_FIT_VERSION = "4b1.1";
