// integrity-r1 end-to-end: the REAL refresh-deals (sweep + per-card) and
// ingest-feed GET handlers and the real display gate, run offline over the
// saved production evidence (tests/harness/ingestion). Providers are
// stubbed, fetch is disabled, writes stay in memory.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cache = new Map();
function run(scenario) {
  if (cache.has(scenario)) return cache.get(scenario);
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/ingestion/register.mjs", "tests/harness/ingestion/driver.mjs", scenario], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(r.status, 0, `${scenario} harness failed: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  cache.set(scenario, out);
  return out;
}

const TG05 = /Pikachu TG05\/TG30/i;
const SLAB_TITLES = [/PSA 9 Charizard GX SV49/, /CHARIZARD EX PSA 8\.5/, /\(CGA 8\.5\)/, /PSA9 Rayquaza EX Promo/, /Ace 9 Ultra Rare/];

for (const scenario of ["sweep", "percard", "feed"]) {
  test(`IR-E2E ${scenario}: no wrong-card identity or raw savings claim reaches a written row`, () => {
    const { status, written, calls } = run(scenario);
    assert.equal(status, 200);
    assert.ok(Object.keys(calls).length > 0, "the run exercised provider stubs");
    for (const w of written) {
      if (TG05.test(w.title)) assert.match(w.writtenAs, /^Pikachu \| SWSH11: Lost Origin Trainer Gallery \| #TG05\/TG30$/, `TG05 listing written as ${w.writtenAs}`);
      if (/#SV64 Lucario/.test(w.title)) assert.doesNotMatch(w.writtenAs, /#SV22\/SV94/);
      if (/#69\b|#69\/68/.test(w.title)) assert.doesNotMatch(w.writtenAs, /#SM210/, w.title);
      if (/SM210/.test(w.title)) assert.match(w.writtenAs, /SM Promos \| #SM210/, w.title);
      if (!w.graded) for (const re of SLAB_TITLES) assert.doesNotMatch(w.title, re, `raw savings claim written for ${w.title}`);
    }
    // a raw copy that only talks about grading is still a normal raw deal
    const contender = written.find((w) => /PSA 10 Contender/.test(w.title));
    assert.ok(contender && !contender.graded && contender.displayable, "PSA 10 Contender raw listing still published");
    // the right card for the TG05 listing is still found
    assert.ok(written.some((w) => TG05.test(w.title) && w.displayable), "TG05 listing still matched to Pikachu TG05/TG30");
  });
}

test("IR-E2E feed: slab-titled raw items are counted as refused, not published", () => {
  const { response } = run("feed");
  assert.equal(response.slabTitleOnRaw, 5);
});

test("IR-E2E memo: graded lookups are reused per LISTING (graded-supply-r1); references stay per CARD", () => {
  const { calls, gradedPriceRequests, response } = run("memo");
  // Before graded-supply-r1 (b3a1170): one grading lookup per matching
  // watchlist row - the synthetic Clefairy slab matches two rows, the SM210
  // slab one = 3. The listing-level reuse (ported from 257e221) makes it 2.
  // Identity matches and reference requests are unchanged: 3 and 3.
  assert.equal(calls.getGradingDetails, 2, "one grading lookup per graded listing");
  assert.equal(response.matched, 3, "identity matching still runs for every candidate card");
  assert.equal(calls.getGradedPrice, 3, "a reference is still requested per candidate card/grader/grade");
  assert.ok(gradedPriceRequests.includes("syn-clefairy-bs|CGC|5.5") && gradedPriceRequests.includes("syn-clefairy-sl|CGC|5.5"), "both candidate printings priced separately");
});

test("IR-E2E stored rows: the display gate hides the live slab-titled raw rows with a named reason and keeps 'Contender'", () => {
  const { rows } = run("stored");
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of [27488, 35441, 35970, 37955]) {
    assert.equal(byId.get(id).displayable, false);
    assert.equal(byId.get(id).disqualificationReason, "identity:graded_title_on_raw");
  }
  assert.equal(byId.get(37679).displayable, true);
});
