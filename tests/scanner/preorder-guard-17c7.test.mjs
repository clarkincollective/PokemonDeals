// Phase 17C.7 - availability, identity and savings are separate questions.
// A release date alone neither disqualifies a listing nor validates one.
// Fixtures are the stored rows read 2026-09-12
// (tests/scanner/fixtures/preorder-17c7.json; no provider calls).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isDisplayableDeal,
  isPremiumDealEligible,
  isDisplayableSealedDeal,
  isVerificationCandidate,
  listingPresentation,
  savingsClaimTrusted,
  sellerTimingClaim,
  earlyListing,
  listingNamesDifferentExpansion,
  disqualificationReason,
} from "../../lib/dealQuality.js";
import { isSociallyEligible } from "../../lib/social/eligibility.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(ROOT, p), "utf8");
const F = JSON.parse(readFileSync(new URL("./fixtures/preorder-17c7.json", import.meta.url), "utf8"));
const row = (list, id) => structuredClone(list.find((r) => r.id === id));
const GRENINJA = row(F.cards, 36745); // AU auction, eBay-confirmed active
const PIKACHU = row(F.cards, 36859); // "In Hand!!!", never exactly verified
const ETB_PRESALE = row(F.sealed, 253); // "pre-sale Rel. 16sept" -> 2021 Celebrations ETB
const ETB_SHIPS = row(F.sealed, 286); // "PRESALE Ships 9/18" -> 2021 Celebrations ETB

const AUDIT = "2026-09-12T12:00:00Z";
const AFTER = "2026-09-20T12:00:00Z";
const at = (iso, fn) => {
  mock.timers.enable({ apis: ["Date"], now: new Date(iso) });
  try {
    return fn();
  } finally {
    mock.timers.reset();
  }
};
// keep freshness stamps beside the clock so only the rule under test decides
const seenAt = (r, iso) => ({ ...r, first_seen_at: r.first_seen_at, last_seen_at: iso, exact_verified_at: null });
const confirmedAt = (r, iso) => ({ ...r, last_seen_at: iso, exact_verified_at: iso });
// an evidenced reference: matches the stored comparison, captured on/after release day
const withEvidence = (r, over = {}) => ({
  ...r,
  reference_condition: "Near Mint",
  reference_printing: "Holofoil",
  reference_captured_at: "2026-09-17T00:00:00Z",
  ...over,
});

test("PG-1. an early listing is shown only on eBay's own confirmation - the seller's words are not evidence", () => {
  at(AUDIT, () => {
    const claimsInHand = seenAt(PIKACHU, "2026-09-12T11:30:00Z");
    assert.equal(sellerTimingClaim(claimsInHand).kind, "in_hand");
    assert.equal(isDisplayableDeal(claimsInHand), false, "an 'in hand' claim is not availability evidence");
    assert.equal(isDisplayableDeal(confirmedAt(PIKACHU, "2026-09-12T11:30:00Z")), true, "eBay confirmation qualifies it");
    // the confirmed auction in the fixture is shown as it stands
    assert.equal(isDisplayableDeal(GRENINJA), true);
    assert.equal(earlyListing(GRENINJA).officialName, "30th Celebration");
  });
});

test("PG-2. the clock alone never qualifies or disqualifies; evidence does", () => {
  const unconfirmed = seenAt(PIKACHU, "2026-09-20T11:30:00Z");
  assert.equal(at(AFTER, () => isDisplayableDeal(unconfirmed)), false, "release day passing is not evidence");
  assert.equal(at(AFTER, () => isDisplayableDeal(confirmedAt(PIKACHU, "2026-09-20T11:30:00Z"))), true);
  // nothing time-based is ever persisted as a disqualification
  assert.equal(at(AUDIT, () => disqualificationReason(seenAt(PIKACHU, "2026-09-12T11:30:00Z"))), null);
  // and it is still a verification candidate, so it can earn the evidence
  assert.equal(at(AUDIT, () => isVerificationCandidate(seenAt(PIKACHU, "2026-09-12T11:30:00Z"))), true);
});

test("PG-3. wrong-product listings stay excluded, before and after release, confirmed or not", () => {
  for (const r of [ETB_PRESALE, ETB_SHIPS]) {
    assert.equal(r.sealed_watchlist.set, "Celebrations", "stored match is the 2021 product");
    assert.equal(listingNamesDifferentExpansion(r), true);
    for (const clock of [AUDIT, AFTER]) {
      assert.equal(at(clock, () => isDisplayableSealedDeal(confirmedAt(r, clock))), false, `${r.id} @ ${clock}`);
      assert.equal(at(clock, () => savingsClaimTrusted(withEvidence(r))), false, `${r.id}: no savings either`);
    }
  }
  const legit2021 = { ...ETB_PRESALE, title: "Pokemon Celebrations Elite Trainer Box 25th Anniversary Sealed" };
  assert.equal(at(AUDIT, () => isDisplayableSealedDeal(legit2021)), true);
});

test("PG-4. savings need evidence that matches the stored comparison, captured no earlier than release", () => {
  at(AFTER, () => {
    const base = confirmedAt(PIKACHU, "2026-09-20T11:30:00Z");
    assert.equal(savingsClaimTrusted(base), false, "no provenance stored on the row today -> plain");
    assert.equal(savingsClaimTrusted(withEvidence(base)), true, "matching condition + printing, captured after release");
    assert.equal(savingsClaimTrusted(withEvidence(base, { reference_captured_at: "2026-09-10T00:00:00Z" })), false, "captured before release day");
    assert.equal(savingsClaimTrusted(withEvidence(base, { reference_condition: "Lightly Played" })), false, "condition mismatch");
    assert.equal(savingsClaimTrusted(withEvidence(base, { reference_printing: null })), false, "printing not recorded");
    const graded = { ...base, is_graded: true, grader: "PSA", grade: "10" };
    assert.equal(savingsClaimTrusted(withEvidence(graded)), false, "graded needs grader + grade, not a raw condition");
    assert.equal(savingsClaimTrusted({ ...graded, reference_grader: "PSA", reference_grade: "10", reference_captured_at: "2026-09-17T00:00:00Z" }), true);
    assert.equal(savingsClaimTrusted({ ...graded, reference_grader: "PSA", reference_grade: "9", reference_captured_at: "2026-09-17T00:00:00Z" }), false, "grade mismatch");
    // sets outside the tracked recent releases are unchanged by this patch
    assert.equal(savingsClaimTrusted({ ...base, card_set: "Base Set", watchlist: { set: "Base Set" }, title: "Charizard 4/102" }), true);
  });
});

test("PG-5. wording: explicit preorders, claimed in-hand, and release phrasing before / after", () => {
  const preorderWithDate = { ...ETB_SHIPS, sealed_watchlist: { ...ETB_SHIPS.sealed_watchlist, set: "ME: 30th Celebration" } };
  at(AUDIT, () => {
    assert.deepEqual(sellerTimingClaim(preorderWithDate), { kind: "preorder", shipsText: "9/18" });
    const notes = listingPresentation(preorderWithDate).notes;
    assert.ok(notes.includes("Upcoming — 30th Celebration releases 16 September"), notes.join(" | "));
    assert.ok(notes.includes("Preorder — seller states it ships 9/18"), notes.join(" | "));
    const noDate = { ...preorderWithDate, title: "Pokemon 30th Celebration Elite Trainer Box PRESALE" };
    assert.ok(listingPresentation(noDate).notes.includes("Preorder — delivery timing not verified"));
    assert.ok(listingPresentation(PIKACHU).notes.includes("Seller says in hand — not independently verified"));
    assert.ok(listingPresentation(confirmedAt(PIKACHU, AUDIT)).notes.includes("eBay confirms this listing is active — not proof of possession or delivery"));
  });
  at(AFTER, () => {
    const notes = listingPresentation(PIKACHU).notes;
    assert.ok(notes.includes("30th Celebration released 16 September · this listing predates it"), notes.join(" | "));
    assert.ok(!notes.some((n) => /^Upcoming/.test(n)), "no 'upcoming' wording after release");
  });
});

test("PG-6. a plain listing inherits no savings treatment anywhere", () => {
  at(AFTER, () => {
    const plain = confirmedAt(PIKACHU, "2026-09-20T11:30:00Z");
    assert.equal(isDisplayableDeal(plain), true, "shown");
    assert.equal(listingPresentation(plain).savings, null, "but with no savings claim");
    assert.equal(isPremiumDealEligible(plain), false, "no premium slot");
    assert.equal(isSociallyEligible(plain), false, "no social promotion");
  });
  // ranking, scores, filters, aggregates, sitemap and structured data
  const deals = src("lib/deals.js");
  assert.equal((deals.match(/sort === "discount" && !savingsClaimTrusted\(/g) || []).length, 4, "every discount-sorted view");
  assert.equal((deals.match(/savingsClaimTrusted\(d\) \? Number\(d\.discount_pct\) : null/g) || []).length, 3, "catalogue tiles");
  assert.match(src("components/SealedDealCard.js"), /<DealScoreBadge score=\{showSavings \? scoreBadge : null\}/);
  assert.match(src("lib/catalogAggregates.js"), /rows = \(rows \?\? \[\]\)\.filter\(\(row\) => savingsClaimTrusted\(row\)\)/);
  assert.match(src("lib/sitemap.js"), /isDisplayableDeal\(r\) && savingsClaimTrusted\(r\)/);
  for (const page of ["app/deals/[id]/page.js", "app/sealed-deals/[id]/page.js"]) {
    assert.match(src(page), /\{showSavings && \(?\s*<script/, `${page}: Product JSON-LD only with evidenced savings`);
    assert.match(src(page), /robots: \{ index: false, follow: true \}/, `${page}: plain listing is noindex`);
  }
  for (const c of ["components/DealCard.js", "components/SealedDealCard.js"]) {
    assert.match(src(c), /const showSavings = presentation\.savings === "trusted";/, c);
  }
});

test("PG-7. the verifier can still reach an early listing (deadlock fix, no quota change)", () => {
  assert.match(src("app/api/verify-deals/route.js"), /if \(!isVerificationCandidate\(r\)\) continue;/);
  assert.match(src("lib/verifyAllocator.mjs"), /if \(!isVerificationCandidate\(row\)\) return false;/);
  at(AUDIT, () => {
    const early = seenAt(PIKACHU, "2026-09-12T11:30:00Z");
    assert.equal(isDisplayableDeal(early), false);
    assert.equal(isVerificationCandidate(early), true);
    // but a wrong-product listing is never worth verifying either
    assert.equal(isVerificationCandidate({ ...early, card_set: "Base Set", watchlist: { set: "Base Set" } }), false);
  });
});
