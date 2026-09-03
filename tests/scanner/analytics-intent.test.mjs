// Phase 13A - search-intent classification.
//
// The single hard rule: classifyQueryIntent() turns a raw query into
// STRUCTURAL facts and NEVER leaks the query text (or any token of it
// that isn't a fixed enum value) into its output.

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyQueryIntent, graderToken, queryLengthBand, containsCollectorNumber } from "../../lib/analytics/intent.js";

const KEYS = [
  "query_token_count",
  "query_length_band",
  "contains_graded_token",
  "contains_raw_token",
  "grader_token",
  "contains_grade_token",
  "contains_price_modifier",
  "contains_language_modifier",
  "contains_collector_number",
  "contains_set_candidate",
];

test("output shape is exactly the declared structural keys", () => {
  const out = classifyQueryIntent("charizard base set psa 10 under $200 japanese 4/102");
  assert.deepEqual(Object.keys(out).sort(), [...KEYS].sort());
  for (const k of KEYS) {
    const v = out[k];
    assert.ok(["string", "number", "boolean"].includes(typeof v), `${k} not primitive`);
  }
});

test("the raw query never appears in the output (no-leak)", () => {
  const queries = [
    "PikachuSecretIdentity 12345",
    "my email is bob@example.com charizard",
    "supersecretcardname pikachu",
    "Umbreon VMAX Alt Art 215/203 rocket base",
    "  weird   spacing   moonbreon  ",
  ];
  for (const q of queries) {
    const out = JSON.stringify(classifyQueryIntent(q)).toLowerCase();
    // every whitespace-separated token of length >= 4 that isn't a known
    // enum value must be absent from the serialised output
    const enums = new Set(["psa", "bgs", "cgc", "sgc", "ace", "none", "other", "true", "false"]);
    for (const tok of q.toLowerCase().split(/\s+/).filter((t) => t.length >= 4)) {
      if (enums.has(tok)) continue;
      assert.ok(!out.includes(tok), `leaked token "${tok}" for query "${q}"`);
    }
    assert.ok(!out.includes("@example.com"));
  }
});

test("graded / raw tokens", () => {
  assert.equal(classifyQueryIntent("graded charizard").contains_graded_token, true);
  assert.equal(classifyQueryIntent("slabbed pikachu").contains_graded_token, true);
  assert.equal(classifyQueryIntent("raw charizard").contains_raw_token, true);
  assert.equal(classifyQueryIntent("ungraded pikachu").contains_raw_token, true);
  assert.equal(classifyQueryIntent("charizard").contains_graded_token, false);
});

test("grader token enum", () => {
  assert.equal(graderToken("charizard psa 10"), "psa");
  assert.equal(graderToken("bgs 9.5 blastoise"), "bgs");
  assert.equal(graderToken("beckett gem"), "bgs");
  assert.equal(graderToken("cgc 9 umbreon"), "cgc");
  assert.equal(graderToken("sgc 8"), "sgc");
  assert.equal(graderToken("charizard"), "none");
});

test("grade token", () => {
  assert.equal(classifyQueryIntent("charizard psa 10").contains_grade_token, true);
  assert.equal(classifyQueryIntent("bgs 9.5 lugia").contains_grade_token, true);
  assert.equal(classifyQueryIntent("grade 7 machamp").contains_grade_token, true);
  assert.equal(classifyQueryIntent("gem mint charizard").contains_grade_token, true);
  assert.equal(classifyQueryIntent("charizard holo").contains_grade_token, false);
});

test("price modifier", () => {
  for (const q of ["charizard under $50", "pikachu below 100", "lugia less than 20", "moonbreon over $300", "card 50 usd"]) {
    assert.equal(classifyQueryIntent(q).contains_price_modifier, true, q);
  }
  assert.equal(classifyQueryIntent("charizard 1999").contains_price_modifier, false);
});

test("language modifier", () => {
  assert.equal(classifyQueryIntent("japanese pikachu").contains_language_modifier, true);
  assert.equal(classifyQueryIntent("charizard jpn").contains_language_modifier, true);
  assert.equal(classifyQueryIntent("german glurak").contains_language_modifier, true);
  assert.equal(classifyQueryIntent("charizard").contains_language_modifier, false);
});

test("collector number detection", () => {
  assert.equal(containsCollectorNumber("charizard 4/102"), true);
  assert.equal(containsCollectorNumber("umbreon 215 / 203"), true);
  assert.equal(containsCollectorNumber("pikachu XY95"), true);
  assert.equal(containsCollectorNumber("gengar #94"), true);
  assert.equal(containsCollectorNumber("charizard holo rare"), false);
});

test("token count + length band", () => {
  assert.equal(classifyQueryIntent("charizard").query_token_count, 1);
  assert.equal(queryLengthBand("charizard"), "1");
  assert.equal(queryLengthBand("charizard base"), "2");
  assert.equal(queryLengthBand("charizard base set holo"), "3-4");
  assert.equal(queryLengthBand("charizard base set holo unlimited 1999"), "5+");
  assert.equal(queryLengthBand(""), "1"); // 0 tokens -> "1" band floor
  assert.equal(classifyQueryIntent("").query_token_count, 0);
});

test("null / non-string input is safe", () => {
  for (const v of [null, undefined, 42, {}, []]) {
    const out = classifyQueryIntent(v);
    assert.equal(typeof out.query_token_count, "number");
    assert.equal(out.grader_token, "none");
  }
});
