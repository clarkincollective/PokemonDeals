// P0.3 - deal 31909 wrong Prerelease/variant identity incident.
//
// Root cause: PokemonPriceTracker catalogues Prerelease/[Staff]-stamped
// promos under the SAME collector number as the ordinary mainline card
// they were stamped from (tcgplayer 126023 "Charizard - 11/108
// (Prerelease)", XY Promos vs tcgplayer 124026 "Charizard", XY -
// Evolutions, both "11/108"). "prerelease" is a MATCH_STOPWORDS entry, so
// a watchlist row named "... (Prerelease)" degenerates to core tokens
// that are indistinguishable from the ordinary print, and the shared
// number satisfied `numberConfirmed`, which used to SKIP variant-evidence
// entirely (VARIANT_MARKERS is deliberately skipped once the title states
// a matching number - correct for Full Art/Alt Art/etc, wrong here since
// the number is not unique to the specialty print). An ordinary "...XY
// Evolutions...Holo..." listing with zero prerelease/staff evidence
// therefore matched the Prerelease watchlist row and was priced against
// its much higher reference - verified live on deal 31909 (briefly #2 in
// Top Deals) plus 4 more active deals (30549, 30825, 32797, 32340) and
// 102 historical deals, found via a 98-row audit of every Prerelease/
// [Staff] catalogue entry sharing a species+number with a different
// catalogue entry (full detail in the P0.3 incident report).
//
// Fix: ALWAYS_REQUIRED_VARIANT_MARKERS in lib/dealMatching.js - Prerelease
// and Staff evidence is now required UNCONDITIONALLY (never skipped by
// numberConfirmed). Because lib/dealQuality.js's listingStillMatchesCatalogue
// re-runs listingMatchesCard against the STORED row.title/card_name/card_set
// on every read, this fix self-heals every already-stored affected row
// (no data migration/backfill needed) - see test 7 below, which reproduces
// the exact 5 real affected rows.

import { test } from "node:test";
import assert from "node:assert/strict";
import { listingMatchesCard } from "../../lib/dealMatching.js";
import { isDisplayableDeal, isPremiumDealEligible } from "../../lib/dealQuality.js";

const match = (title, card) => listingMatchesCard({ title }, card);

const HOUR = 3_600_000;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();

// A fully-populated, otherwise-clean deal row for isDisplayableDeal/
// isPremiumDealEligible testing - mirrors the real shape returned by
// Supabase, overridable per test.
const dealRow = (over = {}) => ({
  id: 999999,
  is_active: true,
  disqualified_reason: null,
  visual_authenticity_status: "MATCH",
  listing_url: "https://www.ebay.com/itm/123456789012",
  affiliate_url: "https://www.ebay.com/itm/123456789012",
  auction_end_at: null,
  listing_type: "FIXED_PRICE",
  is_graded: true,
  grader: "PSA",
  grade: "9",
  condition: "Graded",
  card_language: "english",
  last_seen_at: ago(1),
  first_seen_at: ago(1),
  exact_verified_at: ago(1),
  market_price: 776.36,
  discount_pct: 0.56,
  ...over,
});

// === 1. ordinary printing cannot inherit a prerelease reference without
//        affirmative evidence ===============================================

test("1. an ordinary XY Evolutions listing does NOT match a Prerelease-named catalogue row (no prerelease/staff evidence)", () => {
  assert.equal(
    match("PSA 9 CHARIZARD 11/108 Holo XY Evolutions 2016 Pokemon Card MINT BASE REPRINT", {
      name: "Charizard - 11/108 (Prerelease)",
      set: "XY Promos",
      card_number: "11/108",
    }),
    false
  );
});

// === 2. a genuine prerelease listing still correctly resolves ==============

test("2. a listing that explicitly says Prerelease DOES match the Prerelease catalogue row", () => {
  assert.equal(
    match("XY Charizard 11/108 Prerelease Promo Holo PSA 9", {
      name: "Charizard - 11/108 (Prerelease)",
      set: "XY Promos",
      card_number: "11/108",
    }),
    true
  );
});

test("2b. a genuine Prerelease + Staff-stamped listing that says both correctly resolves", () => {
  assert.equal(
    match("XY Promo Machamp 59/108 Prerelease Staff Stamped Holo NM", {
      name: "Machamp - 59/108 (Prerelease) [Staff]",
      set: "XY Promos",
      card_number: "59/108",
    }),
    true
  );
});

test("2c. Staff-only (no Prerelease wording) still requires Staff evidence, and resolves when present", () => {
  const card = { name: "Garchomp - 5/147 (Championship Promo) [Staff]", set: "League & Championship Cards", card_number: "5/147" };
  assert.equal(match("Garchomp 5/147 League Championship Cards Promo Holo NM", card), false); // no "staff" -> reject
  assert.equal(match("Garchomp 5/147 League Championship Cards Promo STAFF Stamped Holo NM", card), true); // says "staff" -> accept
});

// === 3. an ambiguous ordinary-vs-prerelease listing cannot receive the
//        specialty reference (says neither prerelease nor staff) ===========

test("3. a terse listing naming only species/number/set-era (no variant wording either way) does not receive the Prerelease reference", () => {
  assert.equal(
    match("Charizard 11/108 XY Holo NM", {
      name: "Charizard - 11/108 (Prerelease)",
      set: "XY Promos",
      card_number: "11/108",
    }),
    false
  );
});

test("3b. mentioning 'Staff' alone does not satisfy a row that also requires Prerelease wording", () => {
  // card.name has BOTH markers (Prerelease AND Staff) - both must be present independently.
  const card = { name: "Machamp - 59/108 (Prerelease) [Staff]", set: "XY Promos", card_number: "59/108" };
  assert.equal(match("XY Machamp 59/108 Staff Stamped Holo NM", card), false); // staff present, prerelease missing
  assert.equal(match("XY Machamp 59/108 Prerelease Holo NM", card), false); // prerelease present, staff missing
});

// === 4/5. ambiguous/wrong specialty variant cannot enter premium ranking,
//          cannot inflate a discount via isDisplayableDeal/isPremiumDealEligible ===

test("4. a row whose stored title never matches its stored Prerelease card_name is excluded from display (and therefore premium/ranking) entirely", () => {
  const row = dealRow({
    title: "PSA 9 CHARIZARD 11/108 Holo XY Evolutions 2016 Pokemon Card MINT BASE REPRINT",
    card_name: "Charizard - 11/108 (Prerelease)",
    card_set: "XY Promos",
  });
  assert.equal(isDisplayableDeal(row), false);
  assert.equal(isPremiumDealEligible(row), false);
});

test("5. the wrong higher-value Prerelease reference can no longer be attached to the ordinary listing - the inflated discount never reaches a displayable row", () => {
  // Same shape as test 4, but explicit about the fake numbers this incident
  // actually produced: $338.57 listed vs a $776.36 Prerelease reference
  // (56% "below market") - this must never surface once matching is fixed.
  const row = dealRow({
    title: "Pokemon XY Charizard 11/108 Evoluzioni Holo PSA 9 carte",
    card_name: "Charizard - 11/108 (Prerelease)",
    card_set: "XY Promos",
    total_price_usd: 338.574289981591,
    market_price: 776.36,
    discount_pct: 0.5638952419218005,
  });
  assert.equal(isDisplayableDeal(row), false, "the fake 56%-below deal must not be displayable");
});

// === 6. correct standard reference is selected where evidence supports it ==

test("6. the SAME listing correctly matches the ORDINARY (non-Prerelease) catalogue card when that's what's being checked", () => {
  assert.equal(
    match("PSA 9 CHARIZARD 11/108 Holo XY Evolutions 2016 Pokemon Card MINT BASE REPRINT", {
      name: "Charizard",
      set: "XY - Evolutions",
      card_number: "11/108",
    }),
    true
  );
});

// === 7. deal 31909 fixture (and the other 4 real active affected rows) ====
// fails before / passes after - reproduced verbatim from the live incident.

const REAL_AFFECTED_ROWS = [
  { id: 31909, title: "Pokemon XY Charizard 11/108 Evoluzioni Holo PSA 9 carte", card_name: "Charizard - 11/108 (Prerelease)", card_set: "XY Promos" },
  { id: 30549, title: "PSA 9 CHARIZARD 11/108 Holo XY Evolutions 2016 Pokemon Card MINT BASE REPRINT", card_name: "Charizard - 11/108 (Prerelease)", card_set: "XY Promos" },
  { id: 30825, title: "Charizard 11/108 Evolutions XY Reverse Holo Rare NM/LP", card_name: "Charizard (XY Evolutions Prerelease)", card_set: "XY Promos" },
  { id: 32797, title: "Aerodactyl 1/62 Pokemon TCG 1999 Fossil Set Original WOTC Vintage Holo Rare NM", card_name: "Aerodactyl (Prerelease)", card_set: "WoTC Promo" },
  { id: 32340, title: "Misty's Gyarados 049/182 Holo Miscellaneous Cards & Products Pokemon NM", card_name: "Misty's Gyarados (Prerelease)", card_set: "Miscellaneous Cards & Products" },
];

test("7. every real currently-active affected row (31909 + the 4 more found in the same audit) is now rejected by listingMatchesCard", () => {
  for (const r of REAL_AFFECTED_ROWS) {
    assert.equal(
      listingMatchesCard({ title: r.title }, { name: r.card_name, set: r.card_set }),
      false,
      `deal ${r.id} must no longer match its stored Prerelease card_name`
    );
  }
});

test("7b. the self-healing path: isDisplayableDeal re-derives from the STORED row (no data migration needed) and now excludes all 5", () => {
  for (const r of REAL_AFFECTED_ROWS) {
    const row = dealRow({ title: r.title, card_name: r.card_name, card_set: r.card_set, is_graded: r.id === 31909 || r.id === 30549 });
    assert.equal(isDisplayableDeal(row), false, `deal ${r.id} must be excluded from every display surface`);
  }
});

// === 8. flagship selector rejects mismatched pricing identity ==============

test("8. isPremiumDealEligible (which every flagship/Top-Deals/Best-Finds surface is built on) rejects every affected row", () => {
  for (const r of REAL_AFFECTED_ROWS) {
    const row = dealRow({ title: r.title, card_name: r.card_name, card_set: r.card_set });
    assert.equal(isPremiumDealEligible(row), false, `deal ${r.id} must not be premium-eligible`);
  }
});

// === 9. legitimate specialty variants remain supported (VARIANT_MARKERS
//        family unrelated to this fix) ======================================

test("9. Full Art / Alt Art / Trainer Gallery / SIR / Rainbow / LV.X matching is unchanged by this fix", () => {
  assert.equal(match("Dragonite EX Evolutions Full Art Holo 152/108", { name: "Dragonite EX (Full Art)", set: "XY - Evolutions" }), true);
  assert.equal(match("Dragonite EX Evolutions Holo 152/108", { name: "Dragonite EX (Full Art)", set: "XY - Evolutions" }), false);
  assert.equal(match("Dialga LV.X Diamond Pearl Holo", { name: "Dialga LV.X", set: "Diamond & Pearl" }), true);
  assert.equal(match("Dialga Lv.68 Diamond Pearl Holo", { name: "Dialga LV.X", set: "Diamond & Pearl" }), false);
});

// === 10. WOTC 1st Edition / Shadowless / Unlimited logic is untouched ======

test("10. rawSaleMatchesPrinting's 1st-Edition/Unlimited edition guard is unaffected by this fix", async () => {
  const { rawSaleMatchesPrinting } = await import("../../lib/dealMatching.js");
  const card = { name: "Charizard", set: "Base Set", cardNumber: "4/102" };
  assert.equal(rawSaleMatchesPrinting("Charizard 4/102 Base Set 1st Edition Holo NM", { ...card, firstEditionOnly: false }), false);
  assert.equal(rawSaleMatchesPrinting("Charizard 4/102 Base Set Unlimited Holo NM", { ...card, firstEditionOnly: false }), true);
  assert.equal(rawSaleMatchesPrinting("Charizard 4/102 Base Set 1st Edition Holo NM", { ...card, firstEditionOnly: true }), true);
});

// === 11. holo/reverse-holo tokens are untouched (still stopworded the same way) ===

test("11. 'holo'/'holofoil' remain match-irrelevant tokens - unchanged by this fix", () => {
  assert.equal(
    match("Charizard 11/108 XY Evolutions Reverse Holo NM", { name: "Charizard", set: "XY - Evolutions", card_number: "11/108" }),
    true
  );
  assert.equal(
    match("Charizard 11/108 XY Evolutions Non-Holo NM", { name: "Charizard", set: "XY - Evolutions", card_number: "11/108" }),
    true
  );
});

// === 12. graded/raw mapping is untouched (this fix lives entirely in
//         lib/dealMatching.js, not the graded-condition logic) =============

test("12. is_graded routing in isDisplayableDeal is unaffected - a graded row still skips the raw-condition gate", () => {
  const row = dealRow({
    title: "XY Charizard 11/108 Prerelease Promo Holo PSA 9",
    card_name: "Charizard - 11/108 (Prerelease)",
    card_set: "XY Promos",
    is_graded: true,
    condition: "Graded",
  });
  assert.equal(isDisplayableDeal(row), true); // a genuine prerelease match still displays
});

// === 13. condition/language gates remain intact =============================

test("13. the Japanese-print gate is unaffected by this fix", () => {
  assert.equal(match("Charizard 11/108 XY Evolutions Holo NM", { name: "Charizard", set: "XY - Evolutions", language: "english" }), true);
  assert.equal(
    match("Charizard 11/108 XY Evolutions Japanese Holo NM", { name: "Charizard", set: "XY - Evolutions", language: "english" }),
    false
  );
});

// === 14. P0.2 exact-verification/freshness logic is untouched ==============

test("14. lib/dealMatching.js has no reference to freshness/exact-verification fields - this fix cannot affect P0.2 behavior", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../lib/dealMatching.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /exact_verified_at|isExactVerifiedFresh|FRESHNESS_TTL_HOURS|last_seen_at/);
});
