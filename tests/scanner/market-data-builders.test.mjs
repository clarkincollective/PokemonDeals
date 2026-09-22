// THE FIELD-WHITELIST BUG CLASS.
//
// `marketData` is assembled in TWO places in app/api/refresh-deals/route.js
// - the sweep builder (cachedConditionPrices) and the allocated builder
// (loadCardMarketData) - and each copies a hand-written list of fields out
// of the provider result. Every time a field is added to the producer,
// both whitelists have to be updated, and twice now they were not:
//
//   * 17C.10 added the three provenance fields. The allocated builder
//     omitted them, so every raw row written through that path stored a
//     cleared reference set and could never claim a saving (measured
//     2026-09-16: 14 of 282 allocated raw rows carried provenance, against
//     31 of 31 on the sweep path).
//   * deal 42127 added `byPrintingCondition`. BOTH builders omitted it, so
//     marketDataForListing() found no matrix on any path, returned early,
//     and the printing restriction never ran at all. The resolver was
//     shipped, tested and dead.
//
// Neither failure could show up in a unit test of the producer or of the
// consumer - both were correct in isolation. This file tests the JOIN: the
// fields the consumer reads must be carried by every builder that feeds it.
//
// Static, because building the real thing needs a provider call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const ROUTE = "app/api/refresh-deals/route.js";
const PRODUCER = "lib/pokemonPriceTracker.js";

// Every `marketData = { ... }` object literal in the route.
function marketDataBuilders(src) {
  const out = [];
  const re = /marketData = \{/g;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex - 1;
    let depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

test("1. both marketData builders carry every field the printing resolver and the provenance gate read", () => {
  const src = read(ROUTE);
  const builders = marketDataBuilders(src);
  assert.equal(builders.length, 2, `expected 2 marketData builders, found ${builders.length} - a new one must be added to this check`);

  // The fields marketDataForListing() and selectConditionReference() need.
  // `byPrintingCondition` is the one whose absence silently disabled the
  // whole printing restriction.
  const required = [
    "byCondition",
    "byConditionReference",
    "fallbackPrice",
    "fallbackReference",
    "byPrintingCondition",
    "observedAt",
  ];
  builders.forEach((b, i) => {
    for (const f of required) {
      assert.match(b, new RegExp(`\\b${f}:`), `marketData builder ${i + 1} does not carry \`${f}\``);
    }
  });
});

test("2. every field the producer returns is either carried or deliberately not", () => {
  // A field added to getConditionPrices must be consciously handled. The
  // ignore list is the record of that decision - adding a field to the
  // producer without touching either list fails here.
  const producer = read(PRODUCER);
  const body = producer.slice(producer.indexOf("async function getConditionPrices"));
  const ret = body.slice(body.indexOf("return {"), body.indexOf("\n}"));
  const produced = [...ret.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
  assert.ok(produced.includes("byPrintingCondition"), "the producer no longer returns byPrintingCondition");

  // carried under a different name, or intentionally not propagated
  const renamedOrIntentional = new Set(["lastUpdated"]); // -> observedAt
  const builders = marketDataBuilders(read(ROUTE));
  for (const f of produced) {
    if (renamedOrIntentional.has(f)) continue;
    for (const [i, b] of builders.entries()) {
      assert.match(
        b,
        new RegExp(`\\b${f}:`),
        `producer returns \`${f}\` but marketData builder ${i + 1} drops it - carry it, or add it to renamedOrIntentional with a reason`
      );
    }
  }
});

test("3. the consumer still reads the matrix, and still refuses rather than guessing", () => {
  const src = read(ROUTE);
  assert.match(src, /const matrix = marketData\.byPrintingCondition;/, "marketDataForListing no longer reads the matrix");
  // no matrix -> unchanged passthrough (degrades to the old behaviour)
  assert.match(src, /if \(!matrix \|\| Object\.keys\(matrix\)\.length === 0\) return marketData;/);
  // no defensible printing -> null, so the caller skips the listing
  assert.match(src, /if \(!choice\.printing\) return null;/, "an unevidenced parallel is no longer refused");
  // the aggregate fallback stays gated on a single-printing card
  assert.match(src, /const singlePrinting = Object\.keys\(matrix\)\.length === 1;/);
});
