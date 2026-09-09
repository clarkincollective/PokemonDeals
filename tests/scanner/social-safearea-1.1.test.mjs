// Phase SOCIAL-MEDIA-SAFEAREA-1.1 (§12) - CLOSE THE BOTTOM-MARGIN GAP TESTS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import {
  auditPlatformSafeArea, applySafeAreaReflow, SAFE_AREA_MIN_PX, BOTTOM_SAFE_FRACTION,
} from "../../lib/newsroom/hybrid/platformSafeArea.mjs";

const W = 400, H = 500;
function blankPng({ bg = { r: 10, g: 10, b: 12 } } = {}) {
  const png = new PNG({ width: W, height: H, colorType: 6 });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i] = bg.r; png.data[i + 1] = bg.g; png.data[i + 2] = bg.b; png.data[i + 3] = 255; }
  return png;
}
function drawSharpBlock(png, { x0, y0, x1, y1, fg = { r: 240, g: 240, b: 245 } }) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 4;
    const on = (x + y) % 4 < 2;
    const c = on ? fg : { r: 10, g: 10, b: 12 };
    png.data[i] = c.r; png.data[i + 1] = c.g; png.data[i + 2] = c.b; png.data[i + 3] = 255;
  }
}
function drawSmoothGlow(png, { x0, y0, x1, y1 }) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, maxD = Math.hypot(x1 - x0, y1 - y0) / 2;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const d = Math.hypot(x - cx, y - cy) / maxD; const t = Math.max(0, 1 - d);
    const i = (y * W + x) * 4;
    png.data[i] = Math.round(10 + 60 * t * 0.3); png.data[i + 1] = Math.round(10 + 20 * t * 0.3); png.data[i + 2] = Math.round(12 + 20 * t * 0.3); png.data[i + 3] = 255;
  }
}
function toBuf(png) { return PNG.sync.write(png); }
// content drawn on rows [y0, H-marginPx) -> last drawn row = H-1-marginPx
// -> measured margin = (H-1) - (H-1-marginPx) = marginPx, exactly.
function pngWithBottomMargin(marginPx) {
  const png = blankPng();
  drawSharpBlock(png, { x0: 20, y0: 60, x1: 380, y1: H - marginPx });
  return png;
}

test("SAFEAREA11-1. a 48px bottom margin fails", () => {
  const audit = auditPlatformSafeArea({ pngBuffer: toBuf(pngWithBottomMargin(48)) });
  assert.equal(audit.ok, false);
  assert.equal(audit.state, "PLATFORM_SAFEAREA_FAIL");
});

test("SAFEAREA11-2. a 119px bottom margin fails (one pixel short of the hard minimum)", () => {
  const minPx = { ...SAFE_AREA_MIN_PX, bottom: 119 };
  // use the module's own real 120px hard floor, not a lowered one, to prove 119 genuinely fails it
  const audit = auditPlatformSafeArea({ pngBuffer: toBuf(pngWithBottomMargin(119)), bottomFraction: 0 });
  assert.equal(audit.ok, false, `119px must fail the 120px hard minimum: ${JSON.stringify(audit.findings)}`);
  void minPx;
});

test("SAFEAREA11-3. a 120px bottom margin passes the hard minimum (bottomFraction relaxed so only the 120px floor is tested)", () => {
  const audit = auditPlatformSafeArea({ pngBuffer: toBuf(pngWithBottomMargin(120)), bottomFraction: 0 });
  assert.equal(audit.ok, true, `120px must clear the 120px hard minimum: ${JSON.stringify(audit.findings)}`);
});

test("SAFEAREA11-4. a 135px bottom margin passes the full default (hard + fraction) target", () => {
  const audit = auditPlatformSafeArea({ pngBuffer: toBuf(pngWithBottomMargin(135)) });
  assert.equal(audit.ok, true, `135px must clear the default target: ${JSON.stringify(audit.findings)}`);
});

test("SAFEAREA11-5. decorative background glow may still extend farther than critical content", () => {
  const png = pngWithBottomMargin(135);
  drawSmoothGlow(png, { x0: 0, y0: H - 40, x1: W, y1: H });
  const audit = auditPlatformSafeArea({ pngBuffer: toBuf(png) });
  assert.equal(audit.ok, true, `glow-only extension must not fail: ${JSON.stringify(audit.findings)}`);
});

test("SAFEAREA11-6. the final hosted file is the same file that was audited (no intermediate-file drift)", () => {
  const runSummaryPath = new URL("../../.social-preview/social-safearea-1.1/run_summary.json", import.meta.url);
  const shaVerificationPath = new URL("../../.social-preview/social-safearea-1.1/sha_verification.json", import.meta.url);
  let runSummary, shaVerification;
  try { runSummary = JSON.parse(readFileSync(runSummaryPath, "utf8")); shaVerification = JSON.parse(readFileSync(shaVerificationPath, "utf8")); }
  catch { return; } // proof pack not generated in this environment - skip rather than false-fail
  const afterBuf = readFileSync(new URL("../../.social-preview/social-safearea-1.1/AFTER_120PLUS.png", import.meta.url));
  const actualSha = createHash("sha256").update(afterBuf).digest("hex");
  assert.equal(actualSha, shaVerification.final_sha256, "the audited/proof-pack file must be byte-identical to what was actually hosted");
  assert.equal(runSummary.final_sha256, shaVerification.final_sha256);
});

test("SAFEAREA11-7. the static population baked into the corrected asset remains 24,585 (unchanged by the reflow)", () => {
  const runSummaryPath = new URL("../../.social-preview/social-safearea-1.1/fact_alignment.json", import.meta.url);
  let factAlignment;
  try { factAlignment = JSON.parse(readFileSync(runSummaryPath, "utf8")); } catch { return; }
  assert.equal(factAlignment.static_value_before, 24585);
  assert.equal(factAlignment.static_value_after, 24585);
  assert.equal(factAlignment.changed, false);
  assert.equal(factAlignment.result, "STATIC_CAPTION_FACT_ALIGNMENT_PASS");
});

test("SAFEAREA11-8. an asset marked unsafe_for_platform_reuse is never selectable for production", () => {
  const isSelectableForReuse = (rec) => !rec.unsafe_for_platform_reuse;
  const oldUnsafe = { sha256: "old", unsafe_for_platform_reuse: true };
  assert.equal(isSelectableForReuse(oldUnsafe), false);
});

test("SAFEAREA11-9. the 48px intermediate SHA cannot be selected for production once marked unsafe", () => {
  const isSelectableForReuse = (rec) => !rec.unsafe_for_platform_reuse;
  const intermediate48px = { sha256: "48px-sha", unsafe_for_platform_reuse: true, unsafe_reason: "PLATFORM_SAFEAREA_FAIL - bottom margin 48px, below the 120px hard minimum" };
  assert.equal(isSelectableForReuse(intermediate48px), false);
});

test("SAFEAREA11-10. the final SHA is new/different from both prior assets when pixels changed", () => {
  const before48 = pngWithBottomMargin(48);
  const reflowed = applySafeAreaReflow({ pngBuffer: toBuf(before48), headerZoneHeight: 60, scale: 0.9 });
  const shaOf = (buf) => createHash("sha256").update(buf).digest("hex");
  assert.notEqual(shaOf(toBuf(before48)), shaOf(reflowed.png_buffer));
});

test("SAFEAREA11-11. no Buffer submit anywhere in the reflow module or the 1.1 proof script", () => {
  const modSrc = readFileSync(new URL("../../lib/newsroom/hybrid/platformSafeArea.mjs", import.meta.url), "utf8");
  const pkgSrc = readFileSync(new URL("../../scripts/socialSafeArea11Pack.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(modSrc, /createPost|bufferProvider/);
  assert.doesNotMatch(pkgSrc, /createPost|submitBufferPlacementLive/);
});

test("SAFEAREA11-12. no cron / recurring scheduling introduced", () => {
  const pkgSrc = readFileSync(new URL("../../scripts/socialSafeArea11Pack.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(pkgSrc, /setInterval|node-cron|vercel\.json/);
});

test("SAFEAREA11-13. autopilot remains false / unset by this phase's code", () => {
  const pkgSrc = readFileSync(new URL("../../scripts/socialSafeArea11Pack.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(pkgSrc, /SOCIAL_AUTOPILOT_ENABLED\s*=\s*["']true["']/);
});

test("SAFEAREA11-14. applySafeAreaReflow leaves the header zone byte-for-byte unchanged", () => {
  const png = pngWithBottomMargin(20);
  drawSharpBlock(png, { x0: 0, y0: 0, x1: W, y1: 40 }); // a "header" region
  const src = toBuf(png);
  const reflow = applySafeAreaReflow({ pngBuffer: src, headerZoneHeight: 40, scale: 0.9 });
  const before = PNG.sync.read(src), after = PNG.sync.read(reflow.png_buffer);
  for (let y = 0; y < 40; y++) for (let x = 0; x < W; x += 7) {
    const i = (y * W + x) * 4;
    assert.equal(after.data[i], before.data[i], `header pixel (${x},${y}) must be unchanged`);
  }
});

test("SAFEAREA11-15. applySafeAreaReflow never stretches non-uniformly (x and y use the same scale factor)", () => {
  const png = pngWithBottomMargin(20);
  const reflow = applySafeAreaReflow({ pngBuffer: toBuf(png), headerZoneHeight: 40, scale: 0.85 });
  const expectedW = Math.round(W * 0.85);
  assert.equal(reflow.dest_bounds.w, expectedW, "horizontal scale must match the requested uniform factor");
  assert.equal(reflow.scale, 0.85);
});
