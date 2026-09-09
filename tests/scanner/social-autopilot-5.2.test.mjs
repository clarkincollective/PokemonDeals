// Phase SOCIAL-AUTOPILOT-5.2 - X BUFFER INVALID INPUT DIAGNOSIS + X-ONLY RETRY.
//
// The real production defect: a live X createPost call failed with
// Buffer's own buffer_InvalidInputError ("Twitter / X posts cannot
// exceed 280 characters") because no deterministic check in the caption
// pipeline had ever hard-enforced X's real 280-character limit (only a
// soft, tiered SCORING contribution existed, which gave partial credit
// up to 320 chars and so never blocked a 297-char caption from reaching
// the provider). These tests cover the new hard gate + the read-only,
// structurally-Instagram-safe X-only retry orchestration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  checkXLength, X_CAPTION_HARD_LIMIT, auditCaption, CAPTION_AUDIT_VERSION,
} from "../../lib/newsroom/captions/captionAudit.mjs";
import { REVISABLE_STATES, TERMINAL_WITHHOLD_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";

test("AUTO52-1. the real failed 297-char X caption fails the new hard length check", () => {
  const bad = "85.7% of tracked singles sell under $25. With 85.7% of 24,585 tracked singles, including examples like Clefairy, priced under $25, there's a treasure trove of affordable cards out there.\n\nThis insight helps collectors target budget-friendly additions.\n\nExplore the market on pokemondealfinder.com.";
  const findings = checkXLength(bad, "x");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "X_CAPTION_LENGTH_FAIL");
});

test("AUTO52-2. exactly 280 characters passes; 281 fails (the real X/Buffer boundary)", () => {
  const at280 = "a".repeat(280);
  const at281 = "a".repeat(281);
  assert.equal(checkXLength(at280, "x").length, 0);
  assert.equal(checkXLength(at281, "x").length, 1);
});

test("AUTO52-3. the corrected 272-char retry caption passes", () => {
  const good = "85.7% of tracked singles sell for under $25. With 85.7% of 24,585 tracked singles priced under $25, collectors have ample affordable options. Clefairy is just one example.\n\nKnowing the market shape helps collectors find deals.\n\nExplore the market on pokemondealfinder.com.";
  assert.equal([...good].length, 272);
  assert.equal(checkXLength(good, "x").length, 0);
});

test("AUTO52-4. the same long caption is NEVER flagged for Instagram (no 280 limit there)", () => {
  const long = "a".repeat(500);
  assert.equal(checkXLength(long, "instagram").length, 0);
});

test("AUTO52-5. checkXLength counts codepoints, not UTF-16 code units (matches the file used elsewhere in this codebase)", () => {
  // an em-dash + curly quotes + emoji-adjacent text, exactly 280 codepoints
  const base = "a".repeat(276) + "—’’x"; // 276 + 4 = 280 codepoints
  assert.equal([...base].length, 280);
  assert.equal(checkXLength(base, "x").length, 0);
});

test("AUTO52-6. auditCaption composes the new check - an over-limit X caption fails through the normal pipeline with X_CAPTION_LENGTH_FAIL prioritized", () => {
  const manifest = { example_card: "Clefairy", card_identity: { name: "Clefairy" }, claim_value: 85.7, claim_population: "tracked singles" };
  const longCaption = "85.7% of tracked singles sell under $25. " + "Clefairy is one example of a card in this market segment worth understanding for collectors who want budget-friendly options. ".repeat(2) + "Explore the market on pokemondealfinder.com.";
  assert.ok([...longCaption].length > 280, "fixture must actually exceed 280 chars");
  const audit = auditCaption({ captionText: longCaption, family: "market_snapshot", platform: "x", semanticManifest: manifest });
  assert.equal(audit.ok, false);
  assert.equal(audit.state, "X_CAPTION_LENGTH_FAIL");
  assert.equal(audit.verification.x_length, "FAIL");
});

test("AUTO52-7. the identical caption on Instagram is unaffected by X_CAPTION_LENGTH_FAIL", () => {
  const manifest = { example_card: "Clefairy", card_identity: { name: "Clefairy" }, claim_value: 85.7, claim_population: "tracked singles" };
  const longCaption = "85.7% of tracked singles sell under $25. " + "Clefairy is one example of a card in this market segment worth understanding for collectors who want budget-friendly options. ".repeat(2) + "Explore the market on pokemondealfinder.com.";
  const audit = auditCaption({ captionText: longCaption, family: "market_snapshot", platform: "instagram", semanticManifest: manifest });
  assert.equal(audit.verification.x_length, "PASS");
  assert.notEqual(audit.state, "X_CAPTION_LENGTH_FAIL");
});

test("AUTO52-8. X_CAPTION_LENGTH_FAIL is declared revisable (one bounded retry) then terminal", () => {
  assert.ok(REVISABLE_STATES.includes("X_CAPTION_LENGTH_FAIL"));
  assert.ok(TERMINAL_WITHHOLD_STATES.includes("X_CAPTION_LENGTH_FAIL"));
});

test("AUTO52-9. CAPTION_AUDIT_VERSION was bumped for this phase", () => {
  assert.equal(CAPTION_AUDIT_VERSION, "5b2.1");
});

test("AUTO52-10. the X-only retry script contains no Instagram createPost/submit code path", () => {
  const src = readFileSync(new URL("../../scripts/socialAutopilot52XRetryPilot.mjs", import.meta.url), "utf8");
  // the ONLY submitBufferPlacementLive calls in the file must target the
  // X placement object (xPlacement) - never an instagram one.
  const submitCalls = [...src.matchAll(/submitBufferPlacementLive\(([^,]+),/g)].map((m) => m[1].trim());
  assert.ok(submitCalls.length >= 1, "script must call submitBufferPlacementLive at least once (for X)");
  for (const arg of submitCalls) assert.equal(arg, "xPlacement", `every submitBufferPlacementLive call must pass xPlacement, found: ${arg}`);
  assert.doesNotMatch(src, /buildBufferPlacement\(\{[^}]*platform:\s*"instagram"/s);
});

test("AUTO52-11. the X-only retry script verifies the Instagram placement read-only before doing anything else", () => {
  const src = readFileSync(new URL("../../scripts/socialAutopilot52XRetryPilot.mjs", import.meta.url), "utf8");
  assert.match(src, /getPostStatus\(INSTAGRAM_PROVIDER_REF\)/);
  assert.match(src, /INSTAGRAM_ALREADY_SUBMITTED/);
});

test("AUTO52-12. no cron / recurring scheduling in the new script", () => {
  const src = readFileSync(new URL("../../scripts/socialAutopilot52XRetryPilot.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /setInterval|node-cron|vercel\.json/);
});

test("AUTO52-13. autopilot remains false / unset by this phase's code", () => {
  const src = readFileSync(new URL("../../scripts/socialAutopilot52XRetryPilot.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /SOCIAL_AUTOPILOT_ENABLED\s*=\s*["']true["']/);
});

test("AUTO52-14. TikTok/YouTube/Reddit are never referenced as submit targets in the X-only retry script", () => {
  const src = readFileSync(new URL("../../scripts/socialAutopilot52XRetryPilot.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /platform:\s*"tiktok"|platform:\s*"youtube/);
});
