// Phase 17C.4 - the checklist allowlist must not be trapped behind a cache.
//
// 17C.3 computed eligibility INSIDE fetchSetCatalog, which is wrapped in
// unstable_cache(["set-catalog-v3"], revalidate CARD_HUB_REVALIDATE_SECONDS).
// That key is only the set name + language, so editing CHECKLIST_SETS
// invalidates nothing: a newly allowlisted set kept serving a cached
// `checklistCards: null` decided under the OLD allowlist. Worse, a page
// re-render could consume that stale payload and bake the wrong result
// into another ISR cycle.
//
// The fix evaluates eligibility on the PAGE, from the `cards` array every
// cached payload already carries. These tests pin that behaviour without
// depending on any cache timing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { isChecklistSet, checklistIdentityCheck, CHECKLIST_SETS } from "../../lib/setChecklist.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const code = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let seq = 0;
const card = (over = {}) => {
  seq++;
  return {
    tcgplayerId: String(5000 + seq),
    name: `Card ${seq}`,
    cardNumber: `${String(seq).padStart(3, "0")}/132`,
    rarity: "Common",
    refPrice: 2.5,
    refCondition: null,
    refPrinting: null,
    hubSlug: null,
    catalogSlug: `card-${seq}-gym-heroes`,
    ...over,
  };
};

// The exact decision the page makes, kept in one place so the test
// exercises the rule rather than a paraphrase of it.
const pageDecision = (setName, payload) =>
  !payload.truncated && isChecklistSet(setName) && checklistIdentityCheck(payload.cards).ok
    ? payload.cards
    : null;

test("C4-1. a STALE cached payload (checklistCards decided under the old allowlist) still renders the checklist", () => {
  const cards = [card(), card(), card()];
  // what unstable_cache handed back after the allowlist grew: the decision
  // is stale, but the rows themselves are present and current.
  const stalePayload = { cards, checklistCards: null, truncated: false };

  // the OLD wiring trusted the cached decision - and showed the plain index
  const oldPilot = Array.isArray(stalePayload.checklistCards) && stalePayload.checklistCards.length > 0;
  assert.equal(oldPilot, false, "this is the bug: a newly allowlisted set fell back to the plain index");

  // the NEW wiring re-decides from the rows the payload already carries
  const fresh = pageDecision("Gym Heroes", stalePayload);
  assert.ok(Array.isArray(fresh) && fresh.length === 3, "the checklist renders without waiting for the cache to expire");
});

test("C4-2. the fix never widens eligibility: a set off the allowlist keeps the plain index, stale payload or not", () => {
  const cards = [card(), card()];
  assert.equal(pageDecision("Skyridge", { cards, checklistCards: null, truncated: false }), null);
  assert.equal(pageDecision("Skyridge", { cards, checklistCards: cards, truncated: false }), null,
    "even a cached payload claiming eligibility cannot put a non-allowlisted set on the checklist");
});

test("C4-3. the identity guard still governs: ambiguous rows fall back to the plain index", () => {
  const dupe = [card({ cardNumber: "007/132" }), card({ cardNumber: "007/132" })];
  assert.equal(pageDecision("Gym Heroes", { cards: dupe, checklistCards: null, truncated: false }), null);
  const missing = [card(), card({ cardNumber: null })];
  assert.equal(pageDecision("Gym Heroes", { cards: missing, checklistCards: null, truncated: false }), null);
  const shared = [card({ catalogSlug: "unown-gym-heroes" }), card({ catalogSlug: "unown-gym-heroes" })];
  assert.equal(pageDecision("Gym Heroes", { cards: shared, checklistCards: null, truncated: false }), null);
});

test("C4-4. a browse-capped payload never renders as a complete checklist", () => {
  const cards = [card(), card()];
  assert.equal(pageDecision("Gym Heroes", { cards, checklistCards: null, truncated: true }), null,
    "truncated payloads are refused - a partial list must not look like the full set");
});

test("C4-5. the page decides eligibility itself and no longer trusts the cached field", () => {
  const page = code("app/sets/[slug]/page.js");
  assert.match(
    page,
    /const checklistCards =\s*!catalogTruncated && isChecklistSet\(resolved\.set\) && checklistIdentityCheck\(catalogCards\)\.ok\s*\?\s*catalogCards\s*:\s*null;/,
    "the page derives the checklist from the cached rows"
  );
  assert.doesNotMatch(page, /^\s{6}checklistCards,$/m, "the cached decision is no longer destructured");
  assert.match(page, /import \{ isChecklistSet, checklistIdentityCheck \} from "@\/lib\/setChecklist";/);
  // the existing wiring and guards are untouched
  assert.match(page, /const checklistPilot = Array\.isArray\(checklistCards\) && checklistCards\.length > 0;/);
  assert.match(page, /<SetChecklist setName=\{resolved\.set\} cards=\{checklistCards\} headingId="full-set-index" \/>/);
  assert.match(page, /export const revalidate = 3600;/);
  const deals = code("lib/deals.js");
  assert.match(deals, /unstable_cache\(fetchSetCatalogUncached, \["set-catalog-v3"\]/, "cache key and duration are unchanged");
});

test("C4-6. no debug instrumentation ships", () => {
  const page = code("app/sets/[slug]/page.js");
  assert.doesNotMatch(page, /17C4DEBUG/);
  assert.ok(CHECKLIST_SETS.includes("Gym Heroes"), "fixture set is genuinely on the allowlist");
});
