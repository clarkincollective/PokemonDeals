// graded-growth-r1 (2026-09-14): stop spending eBay getGradingDetails()
// calls that cannot produce a graded reference, and stop letting such a
// listing block the one graded lookup a per-card scan gets. Offline only -
// no eBay / PPT / database call. The graded RULES are unchanged: the new
// title-only pre-check is proven to agree with the pre-change
// gradedReferenceAllowed on every combination below.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dm = require(join(REPO, "lib/dealMatching.js"));
const read = (p) => readFileSync(join(REPO, p), "utf8");

// The pre-change gradedReferenceAllowed, verbatim in behaviour, as the oracle.
function gradedReferenceAllowedBefore(listing, grading) {
  const title = String(listing?.title ?? "");
  if (!title) return false;
  if (dm.looksLikeMultiCardListing(title)) return false;
  if (!dm.isRecognisedGrader(grading?.grader)) return false;
  if (!dm.isValidGradeValue(grading?.grade)) return false;
  if (!dm.mentionsSlabGrader(title)) return false;
  const stated = dm.titleStatedSlabGrade(title);
  if (stated != null && String(stated) !== String(grading.grade).trim()) return false;
  return true;
}

const TITLES = [
  "",
  "Charizard Base Set Shadowless 4/102 1999 Holo PSA 10 GEM MINT",
  "Umbreon VMAX Alt Art 215/203 Evolving Skies CGC 9.5",
  "Blastoise Base Set BGS9 4/102",
  "Charizard Base Set 4/102 Holo PSA 10",
  "Aerodactyl Holo Fossil 1/62 2000 PSA 1 Pokemon",
  "Pokemon Card Raikou 13/64 Holo Neo Revelation Set Vintage English Grade 6.5",
  "Mega Blastoise Ex Full Art 102/108 Ace 9 Ultra Rare",
  "Pikachu & Zekrom GX Tag Team SM168 Promo",
  "Professor's Research ACE SPEC Holo",
  "PSA 10 Contender!!! Zapdos ex 202/165 Sv: Scarlet & Violet 151 Holo",
  "Solgaleo & Lunala GX (Full Art) 216/236 Cosmic Eclipse Holo - PSA 1 Worthy",
  // stored graded rows whose title carries no slab evidence (ledger, graded-growth-r1)
  "Pikachu TG05/TG30 Swsh11: Lost Origin Trainer Gallery Holo",
  "Pikachu w/Egg One Scene Art Series Sticker, Pop 2, No Higher",
  "Charizard ex 054/091 SV: Paldean Fates Holo",
  "Primal Kyogre EX (Shiny Full Art) 96/98 XY - Ancient Origins Holo",
  // multi-card lots
  "Hypno Drowzee Kadabra 3 card lot PSA 10 Base Set Jungle Fossil",
  "Pokemon PSA 9 lot x5 slabs vintage holos",
];
const GRADINGS = [
  { grader: "PSA", grade: "10" }, { grader: "PSA", grade: "9" }, { grader: "PSA", grade: "1" },
  { grader: "CGC", grade: "9.5" }, { grader: "BGS", grade: "9" }, { grader: "ACE", grade: "9" },
  { grader: "TAG", grade: "10" }, { grader: "SGC", grade: "8.5" }, { grader: null, grade: "10" },
  { grader: "PSA", grade: null }, { grader: "PSA", grade: "11" }, { grader: "Some Grader", grade: "9" },
];

test("GG-1. gradedReferenceAllowed is unchanged: identical verdict to the pre-change rule on every title x grading", () => {
  let compared = 0;
  for (const title of TITLES) {
    for (const g of GRADINGS) {
      assert.equal(dm.gradedReferenceAllowed({ title }, g), gradedReferenceAllowedBefore({ title }, g), `${title} :: ${JSON.stringify(g)}`);
      compared++;
    }
  }
  assert.equal(compared, TITLES.length * GRADINGS.length);
});

test("GG-2. a title that fails the pre-check can NEVER receive a graded reference, whatever eBay's item-specifics say", () => {
  for (const title of TITLES) {
    if (dm.gradedLookupWorthwhile({ title })) continue;
    for (const g of GRADINGS) assert.equal(gradedReferenceAllowedBefore({ title }, g), false, `${title} :: ${JSON.stringify(g)}`);
  }
});

test("GG-3. the pre-check skips lots and titles without slab evidence, keeps real slab titles (speculative wording is not decided here)", () => {
  const w = (title) => dm.gradedLookupWorthwhile({ title });
  assert.equal(w(""), false);
  assert.equal(w("Pikachu w/Egg One Scene Art Series Sticker, Pop 2, No Higher"), false);
  assert.equal(w("Charizard ex 054/091 SV: Paldean Fates Holo"), false);
  assert.equal(w("Hypno Drowzee Kadabra 3 card lot PSA 10 Base Set Jungle Fossil"), false);
  assert.equal(w("Umbreon VMAX Alt Art 215/203 Evolving Skies CGC 9.5"), true);
  assert.equal(w("Blastoise Base Set BGS9 4/102"), true);
  // "PSA 1 Worthy" names a grader, so it is NOT skipped here: whether it is
  // a slab is decided by eBay's structured Graded condition + grader
  // descriptor and the full gradedReferenceAllowed - unchanged.
  assert.equal(w("Solgaleo & Lunala GX (Full Art) 216/236 Cosmic Eclipse Holo - PSA 1 Worthy"), true);
});

const card = { name: "Charizard", set: "Base Set", card_number: "4/102", language: "english" };
const L = (id, title, extra = {}) => ({
  listingId: `v1|${id}|0`, title, isGraded: true, listingType: "FIXED_PRICE",
  listingUrl: `https://www.ebay.com/itm/${id}`, affiliateUrl: `https://www.ebay.com/itm/${id}`,
  price: 100, sellerFeedbackScore: 500, sellerFeedbackPct: 100, ...extra,
});

test("GG-4. per-card pick: the cheapest graded listing that can actually receive a reference, not merely the first graded one", () => {
  const listings = [
    L(1, "Charizard Base Set 4/102 Holo Rare 1999 English PSA 9", { isGraded: false }), // not eBay-Graded, never picked
    L(2, "Charizard Base Set 4/102 Holo Rare 1999 English"), // eBay-Graded, no slab evidence
    L(3, "Charizard Base Set 4/102 Holo Rare proxy custom PSA 10"), // proxy
    L(4, "Charizard Base Set 2/102 Holo PSA 10"), // different collector number
    L(5, "Charizard Base Set 4/102 Holo Rare 1999 English PSA 9"), // eligible
    L(6, "Charizard Base Set 4/102 Holo Rare 1999 English CGC 10"), // eligible, pricier
  ];
  const picked = dm.pickGradedLookupCandidate(listings, card);
  assert.equal(picked?.listingId, "v1|5|0");
  // the old rule took listings.find((l) => l.isGraded) -> #2, a certain rejection
  assert.equal(listings.find((l) => l.isGraded).listingId, "v1|2|0");
  assert.equal(gradedReferenceAllowedBefore(listings[1], { grader: "PSA", grade: "10" }), false);
});

test("GG-5. per-card pick never widens acceptance: nothing eligible -> null; contested auction and other card are skipped", () => {
  assert.equal(dm.pickGradedLookupCandidate([], card), null);
  assert.equal(dm.pickGradedLookupCandidate(null, card), null);
  const none = [
    L(7, "Charizard Base Set 4/102 Holo Rare 1999 English"),
    L(8, "Charizard Base Set 4/102 Holo Rare 1999 English PSA 10", { listingType: "AUCTION", bidCount: 3 }),
    L(9, "Blastoise Base Set 2/102 Holo PSA 9"),
    L(10, "Charizard Base Set 4/102 Holo Rare 1999 English PSA 10", { isGraded: false }),
  ];
  assert.equal(dm.pickGradedLookupCandidate(none, card), null);
  // whatever it returns satisfies every pre-call gate the route re-applies
  const one = dm.pickGradedLookupCandidate([...none, L(11, "Charizard Base Set 4/102 Holo BGS 9.5")], card);
  assert.equal(one.listingId, "v1|11|0");
  assert.ok(one.isGraded && dm.qualifiesAsTradingCard(one) && !dm.admitsProxyOrCounterfeit(one, card) && dm.isTrustworthyListing(one) && dm.listingMatchesCard(one, card));
});

test("GG-6. route wiring: sweep skips a hopeless title before the cap and the call, and memoises each fresh lookup by listing_id", () => {
  const src = read("app/api/refresh-deals/route.js");
  const branch = src.slice(src.indexOf("if (listing.isGraded) {"), src.indexOf("if (!languageCompatible(classifyListingLanguage({ title: listing.title }), row.language)) continue;", src.indexOf("if (listing.isGraded) {")));
  const skip = branch.indexOf("if (!gradedLookupWorthwhile(listing)) continue;");
  const reused = branch.indexOf("const reused = knownGrading.get(listing.listingId);");
  const cap = branch.indexOf("if (!reused && gradedLookups >= GRADED_LOOKUP_CAP) continue;");
  const call = branch.indexOf("grading = await getGradingDetails(listing.listingId, marketplaceId);");
  const memo = branch.indexOf("knownGrading.set(listing.listingId, grading);");
  assert.ok(skip > 0 && skip < reused && reused < cap && cap < call && call < memo, JSON.stringify({ skip, reused, cap, call, memo }));
  assert.match(branch, /grading\.grader && gradedReferenceAllowed\(listing, grading\)/, "the full graded rule still decides");
  assert.match(src, /const GRADED_LOOKUP_CAP = 3;/, "cap is the reviewed alloc-rev2 value");
  // graded-supply-r1: reference (PPT) requests backed by this run's lookups
  // are bounded by the same cap, checked before getGradedPrice
  const guard = branch.indexOf("if (gradedReferenceRequests >= GRADED_LOOKUP_CAP) continue;");
  const price = branch.indexOf("await getGradedPrice(");
  assert.ok(memo < guard && guard < price, JSON.stringify({ memo, guard, price }));
});

test("GG-7. route wiring: per-card scans use pickGradedLookupCandidate and still make at most one graded lookup; no new eBay call site", () => {
  const src = read("app/api/refresh-deals/route.js");
  assert.match(src, /const cheapestGraded = pickGradedLookupCandidate\(listings, row\);/);
  assert.doesNotMatch(src, /listings\.find\(\(l\) => l\.isGraded\)/);
  const code = (s) => s.replace(/\/\/[^\n]*/g, "");
  const scanFn = code(src.slice(src.indexOf("async function scanCardInMarketplace"), src.indexOf("function buildWatchlistIndex")));
  assert.equal((scanFn.match(/getGradingDetails\(/g) ?? []).length, 1, "one graded lookup per card scan");
  assert.equal((code(src).match(/await getGradingDetails\(/g) ?? []).length, 2, "same two call sites as before");
  assert.match(scanFn, /grading\.grader && gradedReferenceAllowed\(cheapestGraded, grading\)/);
});
