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

test("a 30th token with a non-30th matched set, on a card the family prints", () => {
  assert.equal(titleClaimsAnniversaryReprint(priced()), false, "no 30th token: not ambiguous");
  assert.equal(
    titleClaimsAnniversaryReprint(priced({ title: "Metagross Delta Species 11/113 30th Anniversary" })),
    true
  );
  // A bare "30th" counts as the marker - sellers abbreviate - but the
  // marker alone no longer decides. The Lugia case below covers that.
  assert.equal(
    titleClaimsAnniversaryReprint(priced({ title: "Metagross Delta Species 11/113 30th!!!" })),
    true,
    "a bare '30th' is still the marker"
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

// The 25th family, confirmed the same way: Celebrations: Classic
// Collection carries Blastoise at 2/102 (the BASE SET number, reprint
// $15.18), Mewtwo EX at 54/99 (Next Destinies, $12.30) and Umbreon Star
// at 17/17 (POP Series 5, $91.29).
test("the Celebrations / 25th family is covered too", () => {
  const mewtwo = priced({
    title: "Pokémon TCG Mewtwo-EX 54/99 Next Destinies Holo Rare English Celebrations",
    card_name: "Mewtwo EX",
    card_set: "Next Destinies",
  });
  assert.equal(titleClaimsAnniversaryReprint(mewtwo), true, "title says Celebrations, match is Next Destinies");
  assert.equal(savingsClaimTrusted(mewtwo), false, "no claim against the vintage reference");

  // Matched TO Celebrations: title and match agree, claim stands.
  assert.equal(
    titleClaimsAnniversaryReprint(priced({ title: "Mewtwo EX 54/99 Celebrations", card_set: "Celebrations: Classic Collection" })),
    false
  );
  // And a vintage listing that never mentions either family is untouched.
  assert.equal(titleClaimsAnniversaryReprint(priced({ title: "Mewtwo EX 54/99 Next Destinies Holo" })), false);
});

test("it never fires without a matched set to disagree with", () => {
  assert.equal(titleClaimsAnniversaryReprint(priced({ title: "30th Anniversary lot", card_set: "" })), false);
  assert.equal(titleClaimsAnniversaryReprint(priced({ title: "30th Anniversary lot", card_set: null })), false);
  for (const bad of [null, undefined, {}]) assert.equal(titleClaimsAnniversaryReprint(bad), false);
});

// The refinement that matters: a marker in the title is not evidence on
// its own. Sellers stuff "30th Anniversary" into listings for genuine
// vintage cards to catch the hype. The ambiguity is real only when the
// reprint family actually prints THIS card at THIS number.
test("a reprint marker on a card the family does not print keeps its claim", () => {
  // The owner's own example: Neo Genesis Lugia 9/111. The 30th Lugias are
  // 121/128 and 149/147, so 9/111 is vintage-only and "30th!!!" is bait.
  const lugia = priced({
    title: "Pokemon TCG Lugia 9/111 Neo Genesis Holo Rare Unlimited 80 HP English 30th!!!",
    card_name: "Lugia",
    card_set: "Neo Genesis",
  });
  assert.equal(titleClaimsAnniversaryReprint(lugia), false, "9/111 is not a 30th printing");
  assert.equal(savingsClaimTrusted(lugia), true, "a genuine vintage deal keeps its claim");
});

test("a reprint marker on a card the family DOES print withdraws the claim", () => {
  // Metagross is 11/113 in both EX Delta Species and the 30th Classic
  // Collection, so the number cannot decide.
  const metagross = priced({ title: "Metagross Delta Species Holo Rare 11/113 English 30th Anniversary" });
  assert.equal(titleClaimsAnniversaryReprint(metagross), true);
  assert.equal(savingsClaimTrusted(metagross), false);
});

test("no number in the title stays conservative", () => {
  // Nothing to check the family against, so the claim is withdrawn rather
  // than guessed at.
  const noNumber = priced({ title: "Metagross Delta Species Holo Rare 30th Anniversary" });
  assert.equal(titleClaimsAnniversaryReprint(noNumber), true);
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
