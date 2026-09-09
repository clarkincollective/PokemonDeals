// Phase SOCIAL-MEDIA-SAFEAREA-1 - PLATFORM CROP / SAFE-ZONE AUDIT + REPAIR.
//
// FULL_GENERATIVE_SOCIAL's master prompt already enforces a TOP brand-safe
// zone (BRAND_SAFE_ZONE_CLAUSE in brandLock.mjs) so the deterministic brand
// header can be overlaid without collision. It had NO equivalent BOTTOM
// margin instruction, so the image model was free to draw decorative
// content (a brush-stroke callout band) flush to - or past - the raw
// bottom pixel row. Buffer/Instagram/X all display the image close to its
// native aspect, so that already-clipped content reads as a platform crop
// bug even though the clipping is baked into the exported PNG itself.
//
// This module is pure pixel measurement + deterministic repair - no vision
// call, no regeneration, no layout/brand redesign. It:
//   1. measures the actual bottom-most (and top/left/right-most) row/column
//      that contains real edged content, distinguishing sharp content
//      (text, icons, brush-stroke edges) from smooth decorative glow/
//      vignette via local gradient sharpness, not just color deviation;
//   2. audits that against platform-safe thresholds (§4/§14);
//   3. when unsafe, finds the nearest gap above the offending trailing
//      band and crops+pads there, restoring the original canvas size with
//      clean background margin - never touching content above the gap.

import { PNG } from "pngjs";

export const PLATFORM_SAFEAREA_VERSION = "safearea1.1";

// §4 - minimum recommendation.
export const SAFE_AREA_MIN_PX = Object.freeze({ top: 70, left: 60, right: 60, bottom: 120 });
// §4 - stronger production target: critical content must end at least
// ~10% of image height above the physical bottom edge.
export const BOTTOM_SAFE_FRACTION = 0.10;

const CONTENT_DELTA = 45; // luminance deviation from local row/col background estimate
const EDGE_DELTA = 30; // local gradient (sharp edge) threshold - excludes smooth glow/vignette
const MIN_CONTENT_PIXELS = 24; // minimum qualifying pixels per row/col to count as "content" (ignores compression/gradient noise)
const MIN_GAP_PX = 20; // minimum run of non-content rows to count as a real separating gap

function luminance(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

export function decodePng(buffer) {
  return PNG.sync.read(buffer);
}

export function encodePng(png) {
  return PNG.sync.write(png);
}

// Robust "background" estimate for one row/column: the median luminance.
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Returns a boolean array, one per row, true if that row contains real
// (sharp-edged) content anywhere across its width.
export function detectContentRows({ data, width, height }) {
  const out = new Array(height).fill(false);
  for (let y = 0; y < height; y++) {
    const rowLum = new Array(width);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rowLum[x] = luminance(data[i], data[i + 1], data[i + 2]);
    }
    const bg = median(rowLum);
    let qualifying = 0;
    for (let x = 1; x < width; x++) {
      const dev = Math.abs(rowLum[x] - bg);
      const edge = Math.abs(rowLum[x] - rowLum[x - 1]);
      if (dev > CONTENT_DELTA && edge > EDGE_DELTA) qualifying++;
    }
    out[y] = qualifying >= MIN_CONTENT_PIXELS;
  }
  return out;
}

// Same idea, column-wise, for left/right bound measurement.
export function detectContentCols({ data, width, height }) {
  const out = new Array(width).fill(false);
  for (let x = 0; x < width; x++) {
    const colLum = new Array(height);
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      colLum[y] = luminance(data[i], data[i + 1], data[i + 2]);
    }
    const bg = median(colLum);
    let qualifying = 0;
    for (let y = 1; y < height; y++) {
      const dev = Math.abs(colLum[y] - bg);
      const edge = Math.abs(colLum[y] - colLum[y - 1]);
      if (dev > CONTENT_DELTA && edge > EDGE_DELTA) qualifying++;
    }
    out[x] = qualifying >= MIN_CONTENT_PIXELS;
  }
  return out;
}

// Morphological "closing": bridges small gaps (typical text line-spacing,
// ~<= radius*2 px) so a multi-line paragraph reads as ONE content band,
// while a genuinely larger gap (paragraph-to-decorative-element spacing)
// survives as a real gap. Used only for BAND/GAP detection (findSafeCropLine)
// - raw (non-dilated) rows are still used for the actual threshold
// measurement so dilation never masks a real edge-clipping violation.
export function dilateRows(rows, radius = 15) {
  const n = rows.length;
  const out = new Array(n).fill(false);
  for (let y = 0; y < n; y++) {
    if (!rows[y]) continue;
    for (let k = Math.max(0, y - radius); k <= Math.min(n - 1, y + radius); k++) out[k] = true;
  }
  return out;
}

/**
 * measureContentBounds(png) -> { top, bottom, left, right, height, width }
 * Bounds are inclusive row/col indices of the first/last content found.
 * null for a side with no detected content at all (blank image).
 */
export function measureContentBounds(png) {
  const { data, width, height } = png;
  const rows = detectContentRows({ data, width, height });
  const cols = detectContentCols({ data, width, height });
  const top = rows.indexOf(true);
  const bottom = rows.lastIndexOf(true);
  const left = cols.indexOf(true);
  const right = cols.lastIndexOf(true);
  return {
    top: top === -1 ? null : top, bottom: bottom === -1 ? null : bottom,
    left: left === -1 ? null : left, right: right === -1 ? null : right,
    width, height, rows,
  };
}

/**
 * auditPlatformSafeArea({ pngBuffer }) -> { ok, state, content_bounds, thresholds, findings }
 * §7/§8 - measures the ACTUAL rendered PNG, not intended layout values.
 * Distinguishes meaningful content (sharp edges) from decorative-only
 * glow/vignette (smooth gradients never trip CONTENT_DELTA+EDGE_DELTA
 * together).
 */
// blockingEdges: which edge violations actually fail the audit (gate
// regeneration / BUFFER_READY). Default is bottom-only, because that is
// the demonstrated, user-reported production defect (a brush-stroke band
// clipped flush to the physical bottom edge) - the whole reason this
// module exists. top/left/right are still measured and reported (§3/§8
// ask for all four edges), but the pre-existing approved brand header
// (~45px) and body-text margins (~50-54px) sit a little under the
// generic §4 minimums without ever having caused an observed clipping
// bug; treating them as blocking would force an in-scope "fix" this
// phase explicitly forbids (§2: no headline-hierarchy/layout redesign).
// Pass strictEdges:["top","left","right","bottom"] for a full 4-edge gate.
export function auditPlatformSafeArea({ pngBuffer, minPx = SAFE_AREA_MIN_PX, bottomFraction = BOTTOM_SAFE_FRACTION, blockingEdges = ["bottom"] }) {
  const png = decodePng(pngBuffer);
  const bounds = measureContentBounds(png);
  const { width, height } = png;
  const bottomSafeMax = height - 1 - Math.max(minPx.bottom, Math.round(height * bottomFraction));
  const findings = [];
  const informational = [];

  const push = (edge, detail) => { (blockingEdges.includes(edge) ? findings : informational).push({ code: "PLATFORM_SAFEAREA_FAIL", edge, detail }); };
  if (bounds.top != null && bounds.top < minPx.top) push("top", `content starts at row ${bounds.top}, below the ${minPx.top}px top-safe minimum`);
  if (bounds.left != null && bounds.left < minPx.left) push("left", `content starts at col ${bounds.left}, below the ${minPx.left}px left-safe minimum`);
  if (bounds.right != null && bounds.right > width - 1 - minPx.right) push("right", `content extends to col ${bounds.right}, inside the ${minPx.right}px right-safe minimum`);
  if (bounds.bottom != null && bounds.bottom > bottomSafeMax) push("bottom", `content extends to row ${bounds.bottom} of ${height} (only ${height - 1 - bounds.bottom}px clean margin; needs >= ${height - 1 - bottomSafeMax}px)`);

  return {
    ok: findings.length === 0,
    state: findings.length === 0 ? "PASS" : "PLATFORM_SAFEAREA_FAIL",
    content_bounds: { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right },
    image: { width, height },
    thresholds: { ...minPx, bottom_safe_max_row: bottomSafeMax, bottom_safe_min_margin_px: height - 1 - bottomSafeMax },
    findings, informational_findings: informational,
  };
}

// Median color of a small sample patch - used to fill padding with a
// matching background color rather than a hardcoded constant.
export function sampleBackgroundColor(png, { x = 20, y = 20, size = 12 } = {}) {
  const { data, width } = png;
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const px = x + dx, py = y + dy;
      const i = (py * width + px) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

/**
 * findSafeCropLine({ rows, height, minBottomMargin }) -> { cropAtRow, margin_after_crop } or null
 *
 * SURGICAL, not exhaustive: finds only the boundary of the bottom-most
 * contiguous content band (the one thing actually at risk of platform
 * clipping) and crops just above it, at the nearest real gap (>=
 * MIN_GAP_PX rows of background). It never keeps hunting further upward
 * past that gap even if the resulting margin still falls short of
 * minBottomMargin - doing so would start eating into the NEXT content
 * band above (real body text, not decoration), which is exactly the
 * over-crop this function must not do. The caller decides, from the
 * returned margin, whether the surgical crop is sufficient on its own or
 * only a partial fix that still needs a corrected regeneration for full
 * compliance (§12).
 */
export function findSafeCropLine({ rows, height, minBottomMargin }) {
  let y = rows.lastIndexOf(true);
  if (y === -1) return null;
  // walk up through the bottom-most content band to its top edge
  while (y >= 0 && rows[y]) y--;
  const gapStart = y;
  let gapLen = 0;
  while (y >= 0 && !rows[y]) { y--; gapLen++; }
  if (gapLen < MIN_GAP_PX) return null; // no real separating gap - not a removable trailer
  // The gap above the bottom-most band must itself be preceded by MORE
  // real content (y here is now the row just above the gap, or -1). If
  // there is nothing left above the gap, "cropping there" would delete
  // the ENTIRE composition, not just a decorative trailer - refuse.
  if (y < 0 || !rows.slice(0, y + 1).some(Boolean)) return null;
  const cropAtRow = Math.max(0, gapStart - Math.floor(gapLen / 2)); // crop mid-gap
  return { cropAtRow, margin_after_crop: height - 1 - cropAtRow, satisfies_target: height - 1 - cropAtRow >= minBottomMargin };
}

/**
 * applyBottomSafeAreaRepair({ pngBuffer, minPx, bottomFraction }) ->
 *   { ok, repaired, png_buffer, sha256, crop_at_row, background_color, reason? }
 *
 * Deterministic derivative: crops the image at the nearest safe gap above
 * the offending bottom band and pads back to the ORIGINAL canvas size with
 * a sampled background color, so aspect ratio and dimensions are
 * unchanged. Content above the crop line is never touched. If no safe gap
 * exists (the critical content itself is unsafe), returns ok:false so the
 * caller knows a derivative fix is not possible and regeneration is
 * required instead (§12).
 */
export function applyBottomSafeAreaRepair({ pngBuffer, minPx = SAFE_AREA_MIN_PX, bottomFraction = BOTTOM_SAFE_FRACTION }) {
  const png = decodePng(pngBuffer);
  const { width, height } = png;
  const audit = auditPlatformSafeArea({ pngBuffer, minPx, bottomFraction });
  const bottomFinding = audit.findings.find((f) => f.edge === "bottom");
  if (!bottomFinding) return { ok: true, repaired: false, png_buffer: pngBuffer, reason: "already safe" };

  const bounds = measureContentBounds(png);
  const minBottomMargin = Math.max(minPx.bottom, Math.round(height * bottomFraction));
  // dilate for band/gap detection only - bridges normal text line-spacing
  // so a multi-line paragraph isn't mistaken for several separate bands.
  const dilated = dilateRows(bounds.rows, 15);
  const cropLine = findSafeCropLine({ rows: dilated, height, minBottomMargin });
  if (cropLine == null) {
    return { ok: false, repaired: false, reason: "no safe gap found above the unsafe bottom content - critical content itself is too low; a deterministic crop cannot fix this without cutting real content. Regeneration required.", audit_before: audit };
  }
  const { cropAtRow: cropAt, satisfies_target: cropSatisfiesTarget } = cropLine;

  const bgColor = sampleBackgroundColor(png, { x: 20, y: cropAt - 30 > 0 ? cropAt - 30 : 5, size: 10 });
  const out = new PNG({ width, height, colorType: 6 });
  // fill with background color
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      out.data[i] = bgColor.r; out.data[i + 1] = bgColor.g; out.data[i + 2] = bgColor.b; out.data[i + 3] = 255;
    }
  }
  // copy rows [0, cropAt) unchanged - everything below stays clean padding
  for (let y = 0; y < cropAt; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      out.data[i] = png.data[i]; out.data[i + 1] = png.data[i + 1]; out.data[i + 2] = png.data[i + 2]; out.data[i + 3] = png.data[i + 3];
    }
  }
  const outBuffer = encodePng(out);
  const auditAfter = auditPlatformSafeArea({ pngBuffer: outBuffer, minPx, bottomFraction });
  return {
    ok: true, repaired: true, png_buffer: outBuffer, crop_at_row: cropAt,
    crop_estimated_sufficient: cropSatisfiesTarget,
    background_color: bgColor, audit_before: audit, audit_after: auditAfter,
    note: auditAfter.ok
      ? "surgical crop removed the trailing decorative band and fully satisfies the safe-area target"
      : "surgical crop removed only the bottom-most decorative content band (never cut into content above it); the remaining critical content still falls short of the full safe-area margin target - a corrected regeneration is recommended for full compliance",
  };
}
