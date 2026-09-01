// Safety + behaviour of the /deals/[id] "return to browsing" hint
// (lib/returnContext, used by components/DealBackLink). The whole point
// is that `from` is a strict internal whitelist - it must be impossible
// to steer it at an external URL or a traversal.

import { test } from "node:test";
import assert from "node:assert/strict";
import { safeReturnPath, returnLabel, returnHref } from "../../lib/returnContext.js";

test("safeReturnPath ACCEPTS the whitelisted internal route families", () => {
  for (const p of [
    "/pokemon/charizard",
    "/pokemon/mr-mime",
    "/sets/legends-awakened",
    "/sets/me-ascended-heroes",
    "/cards/charizard-base-set",
    "/deals",
    "/deals/vintage",
    "/best-finds",
  ]) {
    assert.equal(safeReturnPath(p), p, p);
  }
});

test("safeReturnPath REJECTS anything external, traversing, or off-whitelist", () => {
  for (const p of [
    null,
    undefined,
    123,
    "",
    "https://evil.com",
    "//evil.com",
    "http://evil.com/pokemon/charizard",
    "/pokemon/charizard/../../etc/passwd",
    "/../secret",
    "javascript:alert(1)",
    "/pokemon/charizard?x=1", // query is carried separately, not inside `from`
    "/admin",
    "/api/deals-page",
    "/pokemon/Charizard", // uppercase - slugs are lowercase
    "/pokemon/",
    "/pokemon",
    "/settings/charizard",
    "\\unc\path",
    "/deals%2f..%2f",
    "/cards/<script>",
  ]) {
    assert.equal(safeReturnPath(p), null, String(p));
  }
});

test("returnLabel is human and family-aware", () => {
  assert.equal(returnLabel("/pokemon/charizard"), "Charizard cards & deals");
  assert.equal(returnLabel("/sets/legends-awakened"), "Legends Awakened");
  assert.equal(returnLabel("/cards/charizard-base-set"), "this card");
  assert.equal(returnLabel("/deals"), "all deals");
  assert.equal(returnLabel("/deals/vintage"), "Vintage deals");
  assert.equal(returnLabel("/best-finds"), "Best Finds");
});

test("returnHref keeps ?country only when returning to a shopping surface", () => {
  assert.equal(returnHref("/pokemon/charizard", "EBAY_US"), "/pokemon/charizard?country=EBAY_US");
  assert.equal(returnHref("/sets/legends-awakened", "EBAY_AU"), "/sets/legends-awakened?country=EBAY_AU");
  assert.equal(returnHref("/pokemon/charizard", null), "/pokemon/charizard");
  assert.equal(returnHref("/deals", "EBAY_GB"), "/deals"); // list route - no country
  assert.equal(returnHref("/cards/charizard-base-set", "EBAY_US"), "/cards/charizard-base-set");
});
