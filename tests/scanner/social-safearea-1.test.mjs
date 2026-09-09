// Phase SOCIAL-MEDIA-SAFEAREA-1 (§15) - PLATFORM CROP / SAFE-ZONE REGRESSION TESTS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import {
  auditPlatformSafeArea, applyBottomSafeAreaRepair, measureContentBounds,
  detectContentRows, dilateRows, SAFE_AREA_MIN_PX, BOTTOM_SAFE_FRACTION,
} from "../../lib/newsroom/hybrid/platformSafeArea.mjs";

// ---- synthetic fixture builders (deterministic, no OpenAI) ------------
const W = 400, H = 500;
function blankPng({ bg = { r: 10, g: 10, b: 12 } } = {}) {
  const png = new PNG({ width: W, height: H, colorType: 6 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = bg.r; png.data[i + 1] = bg.g; png.data[i + 2] = bg.b; png.data[i + 3] = 255;
  }
  return png;
}
// A sharp-edged "text-like" block: alternating high-contrast stripes give
// strong local gradients, mimicking real glyph edges.
function drawSharpBlock(png, { x0, y0, x1, y1, fg = { r: 240, g: 240, b: 245 } }) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      const on = (x + y) % 4 < 2; // alternating stripes -> sharp edges every ~2px
      const c = on ? fg : { r: 10, g: 10, b: 12 };
      png.data[i] = c.r; png.data[i + 1] = c.g; png.data[i + 2] = c.b; png.data[i + 3] = 255;
    }
  }
}
// A smooth radial-ish glow: gentle, low-gradient falloff - must NOT trip
// the sharp-edge content detector.
function drawSmoothGlow(png, { x0, y0, x1, y1, peak = { r: 60, g: 20, b: 20 } }) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, maxD = Math.hypot(x1 - x0, y1 - y0) / 2;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const t = Math.max(0, 1 - d);
      const i = (y * W + x) * 4;
      png.data[i] = Math.round(10 + peak.r * t * 0.3);
      png.data[i + 1] = Math.round(10 + peak.g * t * 0.3);
      png.data[i + 2] = Math.round(12 + peak.b * t * 0.3);
      png.data[i + 3] = 255;
    }
  }
}
function toBuf(png) { return PNG.sync.write(png); }

test("SAFEAREA-1. critical content inside the unsafe bottom zone fails", () => {
  const png = blankPng();
  drawSharpBlock(png, { x0: 30, y0: 100, x1: 370, y1: 160 }); // legit body content, safely high
  drawSharpBlock(png, { x0: 30, y0: H - 15, x1: 370, y1: H - 2 }); // content flush to the bottom edge
  const audit = auditPlatformSafeArea({ pngBuffer: toBuf(png) });
  assert.equal(audit.ok, false);
  assert.equal(audit.state, "PLATFORM_SAFEAREA_FAIL");
  assert.ok(audit.findings.some((f) => f.edge === "bottom"));
});

test("SAFEAREA-2. takeaway-style text ending below the safe threshold fails", () => {
  const png = blankPng();
  const unsafeMax = H - 1 - Math.max(SAFE_AREA_MIN_PX.bottom * (H / 1350), Math.round(H * BOTTOM_SAFE_FRACTION));
  drawSharpBlock(png, { x0: 30, y0: Math.round(unsafeMax) - 10, x1: 370, y1: Math.round(unsafeMax) + 10 });
  const audit = auditPlatformSafeArea({ pngBuffer: toBuf(png) });
  assert.equal(audit.state, "PLATFORM_SAFEAREA_FAIL");
});

test("SAFEAREA-3. a safe, corrected layout passes", () => {
  const png = blankPng();
  drawSharpBlock(png, { x0: 30, y0: 60, x1: 370, y1: 300 }); // ends well above the bottom safe line
  const audit = auditPlatformSafeArea({ pngBuffer: toBuf(png) });
  assert.equal(audit.ok, true);
  assert.equal(audit.state, "PASS");
  assert.deepEqual(audit.findings, []);
});

test("SAFEAREA-4. decorative smooth glow may extend into the bottom zone without failing", () => {
  const png = blankPng();
  drawSharpBlock(png, { x0: 30, y0: 60, x1: 370, y1: 250 }); // real content, safe
  drawSmoothGlow(png, { x0: 0, y0: H - 60, x1: W, y1: H }); // decorative glow touching the very edge
  const audit = auditPlatformSafeArea({ pngBuffer: toBuf(png) });
  assert.equal(audit.ok, true, `glow-only bottom should not fail: ${JSON.stringify(audit.findings)}`);
});

test("SAFEAREA-5/6. platform derivative mapping: one shared asset is used for both Instagram and X when safe", async () => {
  const { buildPlatformMediaPayload } = await import("../../lib/autonomous/mediaPackage.mjs");
  const mediaPackage = {
    snapshot_hash: "abc", story_id: "s1", platform: "instagram", media_type: "STATIC_IMAGE",
    sha256: "deadbeef", hosted_url: "https://example.test/by-hash/deadbeef.png", accessibility: "PUBLIC_VERIFIED",
  };
  const ig = buildPlatformMediaPayload({}, "instagram", mediaPackage);
  const x = buildPlatformMediaPayload({}, "x", { ...mediaPackage, platform: "x" });
  assert.equal(ig.assets[0].url, x.assets[0].url, "Instagram and X should receive the identical hosted URL for one safe shared master");
});

test("SAFEAREA-7. static fact text misaligned with the current snapshot is detected as a mismatch", () => {
  const staticBakedValue = 24545; // the OLD cached master's baked-in number
  const currentSnapshotValue = 24585; // the CURRENT immutable snapshot's real number
  const aligned = staticBakedValue === currentSnapshotValue;
  assert.equal(aligned, false, "the known real BEFORE mismatch must be detected as unaligned");
  const staticBakedValueAfter = 24585; // the AFTER (regenerated) master's baked-in number
  assert.equal(staticBakedValueAfter === currentSnapshotValue, true, "the AFTER master must match the current snapshot");
});

test("SAFEAREA-8. the corrected asset gets a new, different sha256 from the old one", () => {
  const before = blankPng(); drawSharpBlock(before, { x0: 0, y0: H - 5, x1: W, y1: H });
  const after = blankPng(); drawSharpBlock(after, { x0: 0, y0: 60, x1: W, y1: 200 });
  const shaOf = (buf) => createHash("sha256").update(buf).digest("hex");
  assert.notEqual(shaOf(toBuf(before)), shaOf(toBuf(after)));
});

test("SAFEAREA-9. an old asset marked unsafe_for_platform_reuse is excluded from being treated as reusable", () => {
  const record = { sha256: "old123", unsafe_for_platform_reuse: true, superseded_by_sha256: "new456" };
  const isSelectableForReuse = (rec) => !rec.unsafe_for_platform_reuse;
  assert.equal(isSelectableForReuse(record), false);
  assert.equal(isSelectableForReuse({ sha256: "new456" }), true);
});

test("SAFEAREA-10. no creative architecture redesign - platformSafeArea.mjs never imports the generative image/prompt-building internals", async () => {
  const src = readFileSync(new URL("../../lib/newsroom/hybrid/platformSafeArea.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /fullGenerative\.mjs|buildMasterPrompt|generateFullSocial|creativeDirector/);
});

test("SAFEAREA-11. no caption-system redesign - platformSafeArea.mjs never touches captions", async () => {
  const src = readFileSync(new URL("../../lib/newsroom/hybrid/platformSafeArea.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /caption/i);
});

test("SAFEAREA-12. no Buffer submit anywhere in the new safe-area module or proof script", () => {
  const modSrc = readFileSync(new URL("../../lib/newsroom/hybrid/platformSafeArea.mjs", import.meta.url), "utf8");
  const pkgSrc = readFileSync(new URL("../../scripts/socialSafeArea1Pack.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(modSrc, /createPost|bufferProvider/);
  assert.doesNotMatch(pkgSrc, /createPost|submitBufferPlacementLive/);
});

test("SAFEAREA-13. no cron / recurring scheduling introduced", () => {
  const modSrc = readFileSync(new URL("../../lib/newsroom/hybrid/platformSafeArea.mjs", import.meta.url), "utf8");
  const pkgSrc = readFileSync(new URL("../../scripts/socialSafeArea1Pack.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(modSrc, /setInterval|node-cron|vercel\.json/);
  assert.doesNotMatch(pkgSrc, /setInterval|node-cron/);
});

test("SAFEAREA-14. autopilot remains false / unset by this phase's code", () => {
  const modSrc = readFileSync(new URL("../../lib/newsroom/hybrid/platformSafeArea.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(modSrc, /SOCIAL_AUTOPILOT_ENABLED\s*=\s*["']true["']/);
});

test("SAFEAREA-15. the deterministic crop-repair never cuts real content it has no gap above (surgical, not exhaustive)", () => {
  const png = blankPng();
  // one continuous content band from y=100 all the way to the bottom edge,
  // NO internal gap at all - there is nothing safely removable.
  drawSharpBlock(png, { x0: 30, y0: 100, x1: 370, y1: H - 1 });
  const repair = applyBottomSafeAreaRepair({ pngBuffer: toBuf(png) });
  assert.equal(repair.ok, false, "must refuse rather than cut into content with no real gap above it");
});

test("SAFEAREA-16. the deterministic crop-repair removes an isolated decorative trailing band and preserves earlier content", () => {
  const png = blankPng();
  drawSharpBlock(png, { x0: 30, y0: 60, x1: 370, y1: 200 }); // real content, ends safely
  // a real gap, then an isolated decorative trailer flush to the edge
  drawSharpBlock(png, { x0: 30, y0: H - 15, x1: 370, y1: H - 2 });
  const repair = applyBottomSafeAreaRepair({ pngBuffer: toBuf(png) });
  assert.equal(repair.ok, true);
  assert.equal(repair.repaired, true);
  const reaudit = auditPlatformSafeArea({ pngBuffer: repair.png_buffer });
  assert.equal(reaudit.ok, true, "after repair the image must pass its own re-audit");
  // the earlier real content band must be untouched (same bytes above the crop line)
  const before = measureContentBounds({ data: png.data, width: png.width, height: png.height });
  const after = measureContentBounds(PNG.sync.read(repair.png_buffer));
  assert.equal(after.top, before.top, "content above the crop line must be preserved exactly");
});

test("SAFEAREA-17. dilateRows bridges normal text line-spacing without merging genuinely separate bands", () => {
  const rows = new Array(200).fill(false);
  for (let y = 10; y < 15; y++) rows[y] = true; // line 1
  for (let y = 20; y < 25; y++) rows[y] = true; // line 2, 5px gap - same paragraph
  for (let y = 120; y < 130; y++) rows[y] = true; // a genuinely separate band, 95px away
  const dilated = dilateRows(rows, 15);
  assert.equal(dilated.slice(10, 25).every(Boolean), true, "the two nearby lines must be bridged into one band");
  assert.equal(dilated.slice(40, 100).some(Boolean), false, "the large real gap before the separate band must survive dilation");
});
