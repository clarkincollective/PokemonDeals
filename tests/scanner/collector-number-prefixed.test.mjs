// Exact collector-number search for PREFIXED subset numbers
// ("RC3/RC32", "SV49/SV94", "TG22/TG30", "GG34/GG70", "H11/H32").
//
// Demonstrated before this change (real pipeline, fixture lookup):
//   * "RC3/RC32"            -> collector=null, mode=provider_fallback, 0 candidates
//                             (a query answerable entirely from card_catalog
//                              was being pushed at the provider)
//   * "charmander rc3/rc32" -> collector=null, mode=species, exact=null
//   * "sv49/sv94"           -> collector="sv49", card_name="/sv94"
//                             (a CONFIDENTLY WRONG number, not merely a miss)
//   * "#rc3/rc32"           -> collector="rc3", card_name="/rc32"
//   * ranking: queryNumbers gave ["rc3","rc32"] while the card's own form
//     was ["rc3/rc32"], so an exact prefixed match earned no number credit.
//
// 532 english rows are affected across 6 families; every family uses the
// SAME prefix on both halves, which is why differing prefixes are not
// claimed as one number.
//
// These tests drive the real parser, the real resolver over a fixture
// lookup, and the real ranker. No DB, no provider.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchIntent, collectorNumberVariants } from "../../lib/searchIntent.js";
import { resolveSearchIntent, createArrayLookup } from "../../lib/searchResolve.js";
import { rerankCatalogResults } from "../../lib/searchRanking.js";

// Real card_catalog rows (verified read-only 2026-09-12). RC5/RC32 and
// RC17/RC32 are present deliberately: they share the "/RC32" tail with
// RC3/RC32, so a suffix-matching bug would resolve the wrong card.
const CATALOG = [
  { tcgplayer_id: "113744", name: "Charmander", set: "Generations: Radiant Collection", set_id: "1729", card_number: "RC3/RC32", rarity: "Common", species: "Charmander", language: "english", market_price: 21.07, image_url: "x" },
  { tcgplayer_id: "113746", name: "Flabebe", set: "Generations: Radiant Collection", set_id: "1729", card_number: "RC5/RC32", rarity: "Common", species: "Flabebe", language: "english", market_price: 1.5, image_url: "x" },
  { tcgplayer_id: "113760", name: "Charizard", set: "Generations: Radiant Collection", set_id: "1729", card_number: "RC17/RC32", rarity: "Ultra Rare", species: "Charizard", language: "english", market_price: 120, image_url: "x" },
  { tcgplayer_id: "197780", name: "Charizard GX", set: "Hidden Fates: Shiny Vault", set_id: "2129", card_number: "SV49/SV94", rarity: "Ultra Rare", species: "Charizard", language: "english", market_price: 180, image_url: "x" },
  { tcgplayer_id: "42375", name: "Charmander", set: "Base Set", set_id: "604", card_number: "046/102", rarity: "Common", species: "Charmander", language: "english", market_price: 12, image_url: "x" },
  { tcgplayer_id: "42382", name: "Charizard", set: "Base Set", set_id: "604", card_number: "004/102", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 869.02, image_url: "x" },
  { tcgplayer_id: "106999", name: "Charizard", set: "Base Set (Shadowless)", set_id: "1663", card_number: "004/102", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 1163.6, image_url: "x" },
  { tcgplayer_id: "246723", name: "Umbreon VMAX (Alternate Art Secret)", set: "SWSH07: Evolving Skies", set_id: "2848", card_number: "215/203", rarity: "Secret Rare", species: "Umbreon", language: "english", market_price: 2368.34, image_url: "x" },
];

const lookup = createArrayLookup(CATALOG);
const resolve = async (q) => {
  const intent = parseSearchIntent(q);
  return { intent, ...(await resolveSearchIntent(intent, { lookup })) };
};

// ===== positive: the reported case, end to end ======================

test("1. 'charmander rc3/rc32' resolves to the exact card, not a broad species list", async () => {
  const { intent, resolution, exact } = await resolve("charmander rc3/rc32");
  assert.equal(intent.subject.collector_number, "rc3/rc32");
  assert.equal(resolution.mode, "exact_card");
  assert.equal(exact.tcgplayer_id, "113744");
  assert.equal(exact.set, "Generations: Radiant Collection");
});

test("2. bare 'RC3/RC32' resolves locally and never reaches provider_fallback", async () => {
  const { resolution, exact } = await resolve("RC3/RC32");
  assert.notEqual(resolution.mode, "provider_fallback", "a catalogue-answerable query must not hit the provider");
  assert.equal(resolution.mode, "exact_card");
  assert.equal(exact.tcgplayer_id, "113744");
});

test("3. the '#' form is not truncated to its first half", async () => {
  const { intent, exact } = await resolve("#rc3/rc32");
  assert.equal(intent.subject.collector_number, "rc3/rc32");
  assert.equal(intent.subject.card_name, null, "no '/rc32' left over as name text");
  assert.equal(exact.tcgplayer_id, "113744");
});

test("4. 'sv49/sv94' is one number, not 'sv49' plus junk (the SV family is the largest, 216 rows)", async () => {
  const { intent, exact } = await resolve("sv49/sv94");
  assert.equal(intent.subject.collector_number, "sv49/sv94");
  assert.equal(exact.tcgplayer_id, "197780");
  assert.equal(exact.name, "Charizard GX");
});

// ===== the whole token matters, never the shared tail ===============

test("5. RC5/RC32 and RC17/RC32 are DIFFERENT cards - the shared '/RC32' tail must not collide", async () => {
  const five = await resolve("rc5/rc32");
  const seventeen = await resolve("rc17/rc32");
  assert.equal(five.exact.tcgplayer_id, "113746", "rc5/rc32 is Flabebe");
  assert.equal(seventeen.exact.tcgplayer_id, "113760", "rc17/rc32 is Charizard");
  assert.notEqual(five.exact.tcgplayer_id, seventeen.exact.tcgplayer_id);
});

// ===== identity guards preserved ====================================

test("6. a collector number is NOT globally unique: a wrong subject still yields a mismatch, not a false exact", async () => {
  const { resolution, exact } = await resolve("pikachu rc3/rc32");
  assert.equal(resolution.mode, "subject_collector_mismatch");
  assert.equal(exact, null, "must not present Charmander as an exact match for Pikachu");
  assert.equal(resolution.subject_collector_mismatch.belongs_to.name, "Charmander");
});

test("7. ambiguity is preserved when a number exists in several sets", async () => {
  const { intent, resolution } = await resolve("charizard 4/102");
  assert.equal(resolution.mode, "exact_card");
  assert.ok(
    intent.ambiguities.some((a) => /exists in \d+ sets/.test(a)),
    "two Base Set prints share 004/102 - the ambiguity must still be recorded"
  );
});

test("8. differing prefixes are NOT claimed as one collector number", () => {
  const i = parseSearchIntent("rc3/tg32");
  assert.notEqual(i.subject.collector_number, "rc3/tg32");
});

// ===== no regression for existing numeric behaviour ==================

test("9. numeric collector numbers are unchanged", () => {
  assert.equal(parseSearchIntent("charizard 4/102").subject.collector_number, "4/102");
  assert.equal(parseSearchIntent("charizard 004/102").subject.collector_number, "4/102");
  assert.equal(parseSearchIntent("umbreon 215/203").subject.collector_number, "215/203");
  assert.equal(parseSearchIntent("10/10").subject.collector_number, "10/10");
});

test("10. set-prefixed bare numbers and grades are unchanged", () => {
  assert.equal(parseSearchIntent("sm110").subject.collector_number, "sm110");
  assert.equal(parseSearchIntent("xy 95").subject.collector_number, "xy95");
  assert.equal(parseSearchIntent("swsh284").subject.collector_number, "swsh284");
  const g = parseSearchIntent("psa 10 pikachu");
  assert.equal(g.subject.collector_number, null, "a grade must never become a collector number");
  assert.equal(g.grade, "10");
  assert.equal(parseSearchIntent("pikachu 25").subject.collector_number, "25");
});

test("11. numeric variants keep their existing leading-zero equivalence", () => {
  const v = collectorNumberVariants("4/102");
  assert.ok(v.includes("4/102") && v.includes("04/102") && v.includes("004/102"));
  assert.ok(collectorNumberVariants("25").includes("025"));
});

// ===== the production lookup is case-sensitive ======================

test("12. prefixed variants carry the STORED uppercase form (createSupabaseLookup uses a case-sensitive .eq.)", () => {
  const v = collectorNumberVariants("rc3/rc32");
  assert.ok(v.includes("rc3/rc32"), "lowercase form for the in-memory lookup");
  assert.ok(v.includes("RC3/RC32"), "uppercase form for the case-sensitive Supabase .eq. - all 532 stored rows are uppercase");
});

test("12b. zero-padded stored numbers are reachable from the unpadded query form", () => {
  // 162 of the 532 stored rows are padded: "H05/H32", "GG02/GG70", and
  // "SV094/SV122" pads the DENOMINATOR. Someone typing the natural
  // unpadded form must still reach them, in stored (uppercase) case.
  const h = collectorNumberVariants("h5/h32");
  assert.ok(h.includes("H05/H32"), "h5/h32 must reach the stored H05/H32");
  const gg = collectorNumberVariants("gg2/gg70");
  assert.ok(gg.includes("GG02/GG70"), "gg2/gg70 must reach the stored GG02/GG70");
  const sv = collectorNumberVariants("sv94/sv122");
  assert.ok(sv.includes("SV094/SV122"), "the denominator is padded too - both halves must be covered");
});

// ===== ordering =====================================================

test("13. an exact prefixed-number match ranks first", () => {
  const asResult = (r) => ({ name: r.name, set: r.set, cardNumber: r.card_number, tcgplayerId: r.tcgplayer_id, marketPrice: r.market_price });
  const ranked = rerankCatalogResults(CATALOG.map(asResult), "RC3/RC32");
  assert.equal(ranked[0].tcgplayerId, "113744");
  assert.equal(ranked[0].cardNumber, "RC3/RC32");
});

test("14. ordering for numeric queries is unchanged (exact number still leads)", () => {
  const asResult = (r) => ({ name: r.name, set: r.set, cardNumber: r.card_number, tcgplayerId: r.tcgplayer_id, marketPrice: r.market_price });
  const ranked = rerankCatalogResults(CATALOG.map(asResult), "umbreon 215/203");
  assert.equal(ranked[0].cardNumber, "215/203");
});

// ===== a prefixed number that matches nothing =======================

test("15. an unmatched prefixed number invents nothing", async () => {
  const { exact } = await resolve("gg99/gg70");
  assert.equal(exact, null, "no card carries gg99/gg70 in the fixture - none may be fabricated");
});
