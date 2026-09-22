// PARALLEL-PRINTING EVIDENCE (deal 42127).
//
// Reported: an Expedition Bulbasaur 94/165 listed "NM/LP" showed a 60%
// saving against a $173.49 reference while its own history sat near $37.
// The stored row's reference_printing was "Reverse Holofoil" - a parallel
// of the plain card, worth several times it in that set. The listing is
// the plain printing, so the reference never described it.
//
// The rule is deliberately narrow, and these fixtures are the reason:
// a reverse holo and a 1st edition are ALWAYS parallels of a plainer
// printing, so the seller must evidence the finish; a Holofoil reference
// is not, because an SIR / Full Art / ex exists only as a holo. Widening
// it to "holo" would have refused ~900 correct comparisons to fix ~200
// wrong ones, which is why the holo case is pinned here as MUST PASS.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  referenceIsUnevidencedParallelPrinting,
  savingsClaimTrusted,
  listingPresentation,
  isDisplayableDeal,
} from "../../lib/dealQuality.js";

// AVAILABILITY STAMPS ARE RELATIVE, NOT LITERAL. These were hardcoded
// to the day the defect was reported, and isDisplayableDeal has a
// freshness component (freshnessTierTtl, 36h for this tier). 36 hours
// after that day the fixture went STALE and the "the listing still
// shows" assertions started failing for a reason that has nothing to do
// with what these tests assert. A test that expires by wall clock is
// testing the clock, so the stamps are now derived from now(). The
// staleness rule itself is unchanged and is covered by its own tests.
const HOURS = 3600 * 1000;
const agoISO = (h) => new Date(Date.now() - h * HOURS).toISOString();

// A row shaped like the real one, reaching the gates through the real
// rules rather than a bare object (see deal-first-r1 R1-6 for why).
function row(over = {}) {
  return {
    id: 42127,
    title: "BULBASAUR 94/165 EXPEDITION BASE SET POKEMON TCG NM/LP",
    card_name: "Bulbasaur (94)",
    card_set: "Expedition",
    card_language: "english",
    card_tcgplayer_id: "84026",
    listing_id: "v1|128000469412|0",
    listing_url: "https://www.ebay.com/itm/128000469412",
    listing_type: "FIXED_PRICE",
    condition: "Lightly Played",
    is_graded: false,
    grader: null,
    grade: null,
    price: 40,
    shipping: 20,
    total_price: 60,
    total_price_usd: 60,
    market_price: 173.49,
    discount_pct: 0.6036,
    reference_source: "ppt_live",
    reference_product_id: "84026",
    reference_amount: 173.49,
    reference_currency: "USD",
    reference_condition: "Lightly Played",
    reference_printing: "Reverse Holofoil",
    reference_observed_at: "2026-09-20T12:03:16.827+00:00",
    reference_synced_at: "2026-09-20T12:03:16.827+00:00",
    is_active: true,
    first_seen_at: agoISO(6),
    last_seen_at: agoISO(1),
    exact_verified_at: agoISO(1),
    visual_authenticity_status: "MATCH",
    image_verdict: "SELLER_FRONT",
    disqualified_reason: null,
    ...over,
  };
}

test("the reported listing: a reverse-holo reference does not price a plain printing", () => {
  const r = row();
  assert.equal(referenceIsUnevidencedParallelPrinting(r), true);
  assert.equal(savingsClaimTrusted(r), false, "no savings claim survives");
  const p = listingPresentation(r);
  assert.equal(p.savings, null);
  // The row is NOT hidden. A refused claim is a presentation change, not
  // a takedown - the listing still shows, still links out, still states
  // its own price.
  assert.equal(isDisplayableDeal(r), true, "the listing still shows");
  assert.ok(
    p.notes.some((n) => /reverse holofoil printing/i.test(n) && /without a savings claim/i.test(n)),
    `the reason names the printing: ${JSON.stringify(p.notes)}`
  );
});

test("a seller who states the finish keeps the comparison", () => {
  for (const title of [
    "Bulbasaur 94/165 Expedition REVERSE HOLO LP",
    "Bulbasaur 94/165 Expedition rev holo LP",
    "Bulbasaur 94/165 Expedition Reverse Holofoil",
  ]) {
    assert.equal(referenceIsUnevidencedParallelPrinting(row({ title })), false, title);
  }
});

test("1st Edition is the same shape of parallel", () => {
  const base = { reference_printing: "1st Edition Holofoil" };
  assert.equal(referenceIsUnevidencedParallelPrinting(row({ ...base, title: "Charizard 4/102 Base Set Holo" })), true);
  assert.equal(referenceIsUnevidencedParallelPrinting(row({ ...base, title: "Charizard 4/102 1st Edition Holo" })), false);
  assert.equal(referenceIsUnevidencedParallelPrinting(row({ ...base, title: "Charizard 4/102 First Edition" })), false);
});

test("a plain Holofoil reference is NOT refused - the card exists only as a holo", () => {
  // The expensive mistake in the other direction. These titles never say
  // "holo" and never need to.
  for (const title of [
    "Mega Gengar ex 284/217 Ascended Heroes SIR",
    "Rayquaza V (Alternate Full Art) 194/203 Evolving Skies",
    "Black Kyurem EX Full Art 145/149 Boundaries Crossed",
  ]) {
    assert.equal(
      referenceIsUnevidencedParallelPrinting(row({ title, reference_printing: "Holofoil" })),
      false,
      title
    );
  }
});

test("a listing that says the opposite is refused too, not rescued by its own words", () => {
  // Real live titles the day this shipped. "Non-Holo" must not be read
  // as evidence FOR a reverse holo.
  for (const title of [
    "Dark Dragonite 15/109 - Non-Holo - Ex Team Rocket Returns",
    "POKEMON WIGGLYTUFF 34/144 EX / LP SKYRIDGE RARE NON HOLO",
    "Psyduck 74/102 Triumphant Regular Common LP",
  ]) {
    assert.equal(referenceIsUnevidencedParallelPrinting(row({ title })), true, title);
  }
});

test("no reference printing recorded is not a refusal - only a KNOWN parallel is", () => {
  assert.equal(referenceIsUnevidencedParallelPrinting(row({ reference_printing: null })), false);
  assert.equal(referenceIsUnevidencedParallelPrinting(row({ reference_printing: "Normal" })), false);
  assert.equal(referenceIsUnevidencedParallelPrinting(row({ reference_printing: "Unlimited" })), false);
});

test("the gate reads the condition field too, not only the title", () => {
  // Some marketplaces carry the finish in the condition/variant string.
  assert.equal(
    referenceIsUnevidencedParallelPrinting(row({ title: "Bulbasaur 94/165 Expedition", condition: "Reverse Holo - Lightly Played" })),
    false
  );
});
