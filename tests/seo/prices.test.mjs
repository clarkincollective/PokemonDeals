import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "./lib.mjs";

// Regression guard for the "$0.00" bug: PokemonPriceTracker returns 0 /
// "" (not null) for a card it has no price data for, and a formatted
// "$0.00" / "A$0.00" reads to a visitor as a real price. Nothing should
// ever render a zero currency value - a missing reference price shows
// "Price unavailable" instead (see lib/money.js hasPrice).
//
// Species pages deliberately sampled across eras, incl. sparse vintage
// sets (Skyridge / e-Reader era) where 0-prices originally showed up.
const SAMPLE = [
  "/pokemon/gengar",
  "/pokemon/gengar?country=EBAY_AU",
  "/pokemon/pikachu",
  "/pokemon/dunsparce",
  "/pokemon/sudowoodo",
  "/pokemon/wooper",
  "/cards/charizard-base-set",
];

// $0.00, A$0.00, C$0.00, £0.00, €0.00, "$ 0.00", "0.00" as a standalone
// price - any currency-symbol-adjacent zero.
const ZERO_PRICE = /(?:[$£€]|A\$|C\$|US\$)\s?0\.00\b/;

for (const path of SAMPLE) {
  test(`${path}: renders no $0.00-style price`, async () => {
    const res = await get(path);
    // 404 is fine (deal rotation / data churn) - only assert on a real page.
    if (res.status !== 200) return;
    const text = res.body.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#x27;|&amp;/g, " ");
    const m = text.match(ZERO_PRICE);
    assert.equal(m, null, `${path}: found a zero-value price "${m && m[0]}" in the rendered page`);
  });
}
