// 2026-09-21, owner-reported: 30th Anniversary cards were being priced
// against the vintage set they reprint.
//
// The mechanism, confirmed in our own catalogue: the 30th Celebration
// Classic Collection keeps the ORIGINAL set's card number. Metagross is
// 11/113 in both EX Delta Species (2005) and the Classic Collection;
// Pikachu & Zekrom GX is 33/181 in both SM Team Up and the Classic
// Collection. The collector number - normally the strongest identity
// signal - cannot separate a $107 original from a cheap reprint, and the
// existing expansion guard passes these because the reprint carries the
// original set's NAME too.
//
// The rule withdraws the SAVINGS CLAIM only. The listing still shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { titleClaimsAnniversaryReprint, savingsClaimTrusted } =
  createRequire(import.meta.url)("../../lib/dealQuality.js");

// A row that otherwise carries a trusted savings claim. The reference
// evidence fields are what storedReferenceEvidence actually requires:
// the reference must name the same product id, the same amount as
// market_price, the same physical condition as the listing, and the exact
// printing. Guessing at these made the control fail for reasons that had
// nothing to do with the rule under test.
const priced = (over = {}) => ({
  title: "Pokémon Metagross Delta Species Holo Rare 11/113 English 2005",
  card_name: "Metagross",
  card_set: "EX Delta Species",
  card_language: "english",
  condition: "Near Mint",
  is_graded: false,
  card_tcgplayer_id: 12345,
  market_price: 107.27,
  discount_pct: 0.74,
  total_price: 27.89,
  reference_product_id: 12345,
  reference_amount: 107.27,
  reference_currency: "USD",
  reference_observed_at: "2026-09-19T12:00:00Z",
  reference_condition: "Near Mint",
  reference_printing: "Holofoil",
  ...over,
});

test("a 30th token with a non-30th matched set is ambiguous", () => {
  assert.equal(titleClaimsAnniversaryReprint(priced()), false, "no 30th token: not ambiguous");
  assert.equal(
    titleClaimsAnniversaryReprint(priced({ title: "Metagross Delta Species 11/113 30th Anniversary" })),
    true
  );
  assert.equal(
    titleClaimsAnniversaryReprint(priced({ title: "Lugia 9/111 Neo Genesis Holo 30th!!!", card_set: "Neo Genesis" })),
    true,
    "a bare '30th' counts - sellers abbreviate"
  );
});

test("a listing matched TO a 30th set is not ambiguous", () => {
  // The title and the match agree; this is the ordinary, correct case and
  // must keep its savings claim. 283 displayable listings sat here on the
  // day the rule shipped.
  for (const set of ["ME: 30th Celebration", "ME: 30th Celebration Classic Collection"]) {
    assert.equal(
      titleClaimsAnniversaryReprint(priced({ title: "Metagross 11/113 30th Anniversary", card_set: set })),
      false,
      set
    );
  }
});

test("it never fires without a matched set to disagree with", () => {
  assert.equal(titleClaimsAnniversaryReprint(priced({ title: "30th Anniversary lot", card_set: "" })), false);
  assert.equal(titleClaimsAnniversaryReprint(priced({ title: "30th Anniversary lot", card_set: null })), false);
  for (const bad of [null, undefined, {}]) assert.equal(titleClaimsAnniversaryReprint(bad), false);
});

test('"30th" must be a whole word, not a fragment', () => {
  // Guard against matching inside a longer token, which would withdraw
  // claims from unrelated listings.
  assert.equal(titleClaimsAnniversaryReprint(priced({ title: "Metagross 130th of a set 11/113" })), false);
});

test("the savings claim is withdrawn, and only the savings claim", () => {
  const plain = priced();
  const ambiguous = priced({ title: "Metagross Delta Species 11/113 English 30th Anniversary" });
  assert.equal(savingsClaimTrusted(plain), true, "the control still carries its claim");
  assert.equal(savingsClaimTrusted(ambiguous), false, "the ambiguous listing carries no claim");
  // It is a claim rule, not a visibility rule: nothing here hides a row.
  const src = createRequire(import.meta.url)("node:fs").readFileSync(
    new URL("../../lib/dealQuality.js", import.meta.url),
    "utf8"
  );
  const gate = src.slice(src.indexOf("function displayGate"), src.indexOf("function displayGate") + 2600);
  assert.ok(
    !gate.includes("titleClaimsAnniversaryReprint"),
    "this must not hide listings - it only withdraws the savings claim"
  );
});
