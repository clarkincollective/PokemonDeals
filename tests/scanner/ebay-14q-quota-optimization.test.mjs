// Phase EBAY-14Q - freshness-aware eBay Browse call-budget optimization.
//
// Pure-logic tests for lib/imageRecoveryPolicy.js + structural assertions
// on app/api/verify-deals, app/api/screen-deal-images, app/api/refresh-
// deals, docs/ebay-rate-limits.md, and vercel.json. No network, no DB, no
// eBay call, no Buffer/provider call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { hasStoredImage, decideImageRecovery } from "../../lib/imageRecoveryPolicy.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// ---- Part 1/2 - shared image-recovery decision (pure logic) -----------

test("14Q-1. hasStoredImage: true for a real http image_url or a real http entry in image_urls, false otherwise", () => {
  assert.equal(hasStoredImage({ image_url: "https://x.com/a.jpg" }), true);
  assert.equal(hasStoredImage({ image_urls: ["https://x.com/a.jpg"] }), true);
  assert.equal(hasStoredImage({}), false);
  assert.equal(hasStoredImage({ image_url: null, image_urls: [] }), false);
  assert.equal(hasStoredImage({ image_url: "not-a-url" }), false);
});

test("14Q-2. decideImageRecovery: NOOP when the row already has an image - never re-fetches what is already known", () => {
  const r = decideImageRecovery({ row: { image_url: "https://x.com/a.jpg" }, snapStatus: "ACTIVE", snapPrimaryImage: "https://x.com/b.jpg" });
  assert.equal(r.outcome, "NOOP");
});

test("14Q-3. decideImageRecovery: RECOVERED when the row has none and the live snapshot has one - real URL only, never invented", () => {
  const r = decideImageRecovery({ row: {}, snapStatus: "ACTIVE", snapPrimaryImage: "https://x.com/b.jpg", snapImageUrls: ["https://x.com/b.jpg", "https://x.com/c.jpg"] });
  assert.equal(r.outcome, "RECOVERED");
  assert.equal(r.imageUrl, "https://x.com/b.jpg");
  assert.deepEqual(r.imageUrls, ["https://x.com/b.jpg", "https://x.com/c.jpg"]);
});

test("14Q-4. decideImageRecovery: CONFIRMED_NO_IMAGE when the row has none and the live snapshot ALSO has none (real listing read)", () => {
  const r = decideImageRecovery({ row: {}, snapStatus: "ACTIVE", snapPrimaryImage: null, snapImageUrls: [] });
  assert.equal(r.outcome, "CONFIRMED_NO_IMAGE");
});

test("14Q-5. decideImageRecovery: INCONCLUSIVE on ENDED/UNKNOWN status - never treated as a confirmed 'no image', never retired here", () => {
  assert.equal(decideImageRecovery({ row: {}, snapStatus: "ENDED" }).outcome, "INCONCLUSIVE");
  assert.equal(decideImageRecovery({ row: {}, snapStatus: "UNKNOWN" }).outcome, "INCONCLUSIVE");
});

test("14Q-6. decideImageRecovery: a non-http primaryImage falls back to the first http URL in imageUrls, never a bare string", () => {
  const r = decideImageRecovery({ row: {}, snapStatus: "ACTIVE", snapPrimaryImage: "not-a-url", snapImageUrls: ["https://x.com/ok.jpg"] });
  assert.equal(r.outcome, "RECOVERED");
  assert.equal(r.imageUrl, "https://x.com/ok.jpg");
});

// ---- Part 2 - verify-deals: never re-derives price/status from the new
// image logic; both row types now share one call, one decision --------

test("14Q-7. verify-deals BIN branch now uses getListingSnapshot (same cost, more data) instead of calling getListingFreshness as a function", () => {
  const src = read("app/api/verify-deals/route.js");
  assert.doesNotMatch(src, /getListingFreshness\(/); // no CALL to it remains (a comment may still name it)
  assert.doesNotMatch(src, /import \{[^}]*getListingFreshness/); // and it is no longer imported
  const calls = (src.match(/await getListingSnapshot\(/g) ?? []).length;
  assert.equal(calls, 2, "expected exactly one getListingSnapshot call in the auction branch and one in the BIN branch");
});

test("14Q-8. verify-deals' auction re-price path (repricedAuctionPatch) is untouched - called exactly once, and the BIN branch's status comes straight from the snapshot", () => {
  const src = read("app/api/verify-deals/route.js");
  const callCount = (src.match(/repricedAuctionPatch\(\{/g) ?? []).length;
  assert.equal(callCount, 1, "repricedAuctionPatch should still be CALLED exactly once (mentions in comments don't count)");
  // the BIN branch's status must come straight from the snapshot's own
  // status field - never invented, never re-derived through the auction
  // re-price path.
  const elseStart = src.lastIndexOf("} else {");
  assert.ok(elseStart > 0);
  const elseBlock = src.slice(elseStart, elseStart + 900);
  assert.match(elseBlock, /status = snap\.status;/);
});

test("14Q-9. verify-deals' image-recovery/confirmation only ever runs on an ACTIVE status, and is applied via the shared decision exactly twice (once per row type)", () => {
  const src = read("app/api/verify-deals/route.js");
  const decisionCalls = (src.match(/const decided = decideImageRecovery\(/g) ?? []).length;
  assert.equal(decisionCalls, 2, "the shared decision must be invoked once in the auction branch and once in the BIN branch");
});

test("14Q-10. verify-deals' CONFIRMED_NO_IMAGE path reuses the EXACT NO_TRUSTED_IMAGE convention screen-deal-images already used - no new verdict invented", () => {
  const src = read("app/api/verify-deals/route.js");
  assert.match(src, /IMAGE_VERDICT\.NO_TRUSTED_IMAGE/);
});

test("14Q-11. verify-deals RESERVE and BATCH are unchanged", () => {
  const src = read("app/api/verify-deals/route.js");
  assert.match(src, /const BATCH = 20;/);
  assert.match(src, /const RESERVE = 800;/);
});

// ---- Part 2 - screen-deal-images: shares the same decision, own reserve
// floors untouched ---------------------------------------------------

test("14Q-12. screen-deal-images now delegates its recovery decision to the SAME shared module verify-deals uses", () => {
  const src = read("app/api/screen-deal-images/route.js");
  assert.match(src, /from "@\/lib\/imageRecoveryPolicy"/);
  assert.match(src, /decideImageRecovery\(/);
});

test("14Q-13. screen-deal-images' own reserve floor and per-run cap are unchanged", () => {
  const src = read("app/api/screen-deal-images/route.js");
  assert.match(src, /const IMAGE_RECOVER_PER_RUN = 12;/);
  assert.match(src, /const RECOVER_RESERVE = 900;/);
  assert.match(src, /const RESCREEN_AFTER_DAYS = 14;/);
});

test("14Q-14. the shared decision never runs unless screen-deal-images already committed to a real eBay call for this row (recoverListingImages is only invoked when hasStoredImages is false)", () => {
  const src = read("app/api/screen-deal-images/route.js");
  const start = src.indexOf("if (!hasStoredImages(row)) {");
  assert.ok(start > 0);
});

// ---- Part 3 - graded-lookup dedup in refresh-deals sweep ---------------

test("14Q-15. refresh-deals builds a per-sweep known-grading map from `deals`, keyed strictly by the exact listing_id this sweep is scanning", () => {
  const src = read("app/api/refresh-deals/route.js");
  const start = src.indexOf("const gradedListingIds");
  assert.ok(start > 0);
  const block = src.slice(start, start + 900);
  assert.match(block, /\.in\("listing_id", gradedListingIds\)/);
  assert.match(block, /\.eq\("marketplace", marketplaceId\)/);
  assert.match(block, /\.not\("grader", "is", null\)/);
});

test("14Q-16. a reused grading value is looked up by the CURRENT listing's own listingId - never a different listing's data", () => {
  const src = read("app/api/refresh-deals/route.js");
  assert.match(src, /const reused = knownGrading\.get\(listing\.listingId\);/);
});

test("14Q-17. GRADED_LOOKUP_CAP only gates NEW eBay calls - a reused (already-known) grading never counts against it or gets skipped by it", () => {
  const src = read("app/api/refresh-deals/route.js");
  assert.match(src, /if \(!reused && gradedLookups >= GRADED_LOOKUP_CAP\) continue;/);
});

test("14Q-18. GRADED_LOOKUP_CAP itself is unchanged", () => {
  const src = read("app/api/refresh-deals/route.js");
  assert.match(src, /const GRADED_LOOKUP_CAP = 6;/);
});

test("14Q-19. a missing/stale grading lookup still makes a real eBay call - the dedup never fabricates a value for an unresolved listing", () => {
  const src = read("app/api/refresh-deals/route.js");
  const start = src.indexOf("let grading;");
  const block = src.slice(start, start + 600);
  assert.match(block, /grading = await getGradingDetails\(listing\.listingId, marketplaceId\);/);
});

// ---- Part 6 - cron schedules / reserve floors unchanged across the board ---

test("14Q-20. vercel.json cron schedules for every eBay-consuming route are unchanged", () => {
  const cfg = JSON.parse(read("vercel.json"));
  const byPath = Object.fromEntries(cfg.crons.map((c) => [c.path, c.schedule]));
  assert.equal(byPath["/api/verify-deals"], "*/30 * * * *");
  assert.equal(byPath["/api/screen-deal-images"], "15 * * * *");
  assert.equal(byPath["/api/refresh-deals?mode=sweep&country=EBAY_US&pages=5"], "*/15 * * * *");
  assert.equal(byPath["/api/ingest-feed"], "0 * * * *");
  assert.equal(byPath["/api/refresh-sealed-deals"], "0 6 * * *");
});

test("14Q-21. no provider/social/Buffer code path was touched by this phase's changes", () => {
  for (const p of ["app/api/verify-deals/route.js", "app/api/screen-deal-images/route.js", "app/api/refresh-deals/route.js", "lib/imageRecoveryPolicy.js"]) {
    const src = read(p);
    assert.doesNotMatch(src, /providers\/buffer|bufferGraphQL|SOCIAL_BUFFER_BACKLOG_ENABLED|SOCIAL_AUTOPILOT_ENABLED/);
  }
});

test("14Q-22. lib/imageRecoveryPolicy.js makes no network/DB call itself - pure decision only", () => {
  const src = read("lib/imageRecoveryPolicy.js");
  assert.doesNotMatch(src, /fetch\(|supabaseAdmin|await /);
});

// ---- Part 7 - docs updated with the real current system ----------------

test("14Q-23. docs/ebay-rate-limits.md documents verify-deals and screen-deal-images (the old doc omitted both)", () => {
  const doc = read("docs/ebay-rate-limits.md");
  assert.match(doc, /verify-deals[\s\S]{0,200}960/);
  assert.match(doc, /screen-deal-images[\s\S]{0,200}288/);
});

test("14Q-24. docs/ebay-rate-limits.md labels the Phase 14Q savings figures as modeled/estimated", () => {
  const doc = read("docs/ebay-rate-limits.md");
  assert.match(doc, /modeled/i);
  assert.match(doc, /estimate/i);
});

test("14Q-25. docs/ebay-rate-limits.md still states a sustainability verdict, and it is not an unqualified YES", () => {
  const doc = read("docs/ebay-rate-limits.md");
  assert.match(doc, /BORDERLINE/);
});
