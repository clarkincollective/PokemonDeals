// The external-discovery board parser (lib/pokeFeed.js parseFeedHtml).
// This is the one piece most likely to silently break when the upstream
// board changes its markup, so it gets its own contract test:
//   - the eBay numeric item id is pulled from the `du` (destination URL) param
//   - the eBay TLD maps to the right EBAY_* marketplace
//   - non-eBay / malformed / unknown-marketplace rows are dropped, not guessed
//   - the same listing is not emitted twice

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeedHtml } from "../../lib/pokeFeed.js";

const ROW = (href) => `<div class="deal"><a href="${href}" class="history-btn" title="Price history">history</a></div>`;

const GOOD_HTML = [
  ROW(
    "https://pokedealfinder.uk/public/cards/aaaa/bbbb/?market=UK&amp;dp=11.54&amp;dv=Raw&amp;df=auction" +
      "&amp;du=https%3A%2F%2Fwww.ebay.co.uk%2Fitm%2F377442529729%3F_skw%3Dpokemon%26hash%3Ditem57e1" +
      "&amp;dti=Ninetales+EX+186%2F165&amp;di=https%3A%2F%2Fi.ebayimg.com%2Fx.jpg"
  ),
  ROW(
    "https://pokedealfinder.uk/public/cards/cccc/dddd/?market=US&amp;dp=203.5&amp;dv=BGS+9.5&amp;df=bin" +
      "&amp;du=https%3A%2F%2Fwww.ebay.com%2Fitm%2F158230582525&amp;dti=Groudon+Holo"
  ),
  ROW(
    "https://pokedealfinder.uk/public/cards/eeee/ffff/?market=DE&amp;df=bin" +
      "&amp;du=https%3A%2F%2Fwww.ebay.de%2Fitm%2F287520704171"
  ),
  // duplicate of row 1 (same item, appears again lower on the page)
  ROW(
    "https://pokedealfinder.uk/public/cards/aaaa/bbbb/?market=UK" +
      "&amp;du=https%3A%2F%2Fwww.ebay.co.uk%2Fitm%2F377442529729"
  ),
].join("\n");

test("parseFeedHtml: extracts item id + marketplace from the du param", () => {
  const items = parseFeedHtml(GOOD_HTML);
  assert.equal(items.length, 3, "3 unique listings (the duplicate row is dropped)");

  const gb = items.find((i) => i.ebayItemId === "377442529729");
  assert.ok(gb, "found the ebay.co.uk listing");
  assert.equal(gb.marketplace, "EBAY_GB");
  assert.equal(gb.feedMarket, "UK");
  assert.equal(gb.feedPrice, 11.54);
  assert.equal(gb.feedCondition, "Raw");
  assert.equal(gb.feedFormat, "auction");

  assert.equal(items.find((i) => i.ebayItemId === "158230582525").marketplace, "EBAY_US");
  assert.equal(items.find((i) => i.ebayItemId === "287520704171").marketplace, "EBAY_DE");
});

test("parseFeedHtml: drops rows it can't confidently resolve", () => {
  const html = [
    // no du param
    ROW("https://pokedealfinder.uk/public/cards/a/b/?market=UK&amp;dp=5"),
    // du points somewhere that isn't eBay
    ROW("https://pokedealfinder.uk/public/cards/c/d/?du=https%3A%2F%2Fexample.com%2Fitm%2F123456789"),
    // eBay marketplace we don't scan (ebay.fr)
    ROW("https://pokedealfinder.uk/public/cards/e/f/?du=https%3A%2F%2Fwww.ebay.fr%2Fitm%2F999888777666"),
    // du is an eBay URL but with no /itm/<number>
    ROW("https://pokedealfinder.uk/public/cards/g/h/?du=https%3A%2F%2Fwww.ebay.com%2Fsch%2Fpokemon"),
  ].join("\n");
  assert.deepEqual(parseFeedHtml(html), []);
});

test("parseFeedHtml: no card links at all -> empty array, no throw", () => {
  assert.deepEqual(parseFeedHtml("<html><body><h1>Deals</h1></body></html>"), []);
});
