// The release-day boundary, under controlled time.
//
// WHY THIS EXISTS. On 2026-09-16T20:00:00.000Z the R1-6 fixture assertion
// began to fail with no code change. The `bin_upcoming` fixture carried
// `first_seen_at: ago(30)` - thirty hours before `NOW = Date.now()`, read at
// module load from the real system clock - while the test pinned only the
// OTHER clock, the `now` argument (2026-09-12T12:00Z). earlyListing compares
// `first_seen_at` against the release START, not against `now`, so the
// fixture was an early listing only while the real clock sat below
// 2026-09-15T14:00Z + 30h = 2026-09-16T20:00:00.000Z. At that instant it
// slid past the boundary and correctly stopped being early.
//
// The rule was never wrong. The fixture measured from the wrong origin, so
// it aged out of the state it was built to demonstrate. These tests pin the
// boundary itself with an explicit clock on BOTH sides of the comparison,
// and pin the fixture as clock-independent so it cannot drift again.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { earlyListing, listingPresentation } from "../../lib/dealQuality.js";
import { officialReleaseForSet, releaseStartFor } from "../../lib/pokemonSets.js";
import { DEAL_STATE_FIXTURES } from "../../lib/dev/dealStateFixtures.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const SET = "ME: 30th Celebration";
const RECORD = officialReleaseForSet(SET);
const START = releaseStartFor(RECORD).getTime();

const listing = (firstSeenIso) => ({
  id: 1,
  title: "30th Celebration single",
  card_set: SET,
  first_seen_at: firstSeenIso,
  market_price: 190,
  total_price: 125,
  condition: "Near Mint",
  is_graded: false,
});
const at = (ms) => new Date(ms).toISOString();

test("0. the boundary is the release day's start in the record's own zone", () => {
  // a worldwide release flips at midnight in Sydney, not UTC and not LA
  assert.equal(RECORD.released, "2026-09-16");
  assert.equal(RECORD.worldwide, true);
  assert.equal(new Date(START).toISOString(), "2026-09-15T14:00:00.000Z");
});

// --- first_seen_at, the side that decides IF a listing is early ----------

test("1. first seen one millisecond BEFORE the release start is early", () => {
  const early = earlyListing(listing(at(START - 1)), START - 1);
  assert.ok(early, "a listing that existed before release day is an early listing");
  assert.equal(early.officialName, "30th Celebration");
  assert.equal(early.released, "2026-09-16");
  assert.equal(early.releasedYet, false);
});

test("2. first seen EXACTLY AT the release start is not early", () => {
  // the comparison is `firstSeen >= startMs`, so the boundary instant
  // belongs to the released side
  assert.equal(earlyListing(listing(at(START)), START), null);
});

test("3. first seen one millisecond AFTER the release start is not early", () => {
  assert.equal(earlyListing(listing(at(START + 1)), START + 1), null);
  // and an hour after, and thirty hours after - the case that broke R1-6
  assert.equal(earlyListing(listing(at(START + 3600_000)), START + 3600_000), null);
  assert.equal(earlyListing(listing(at(START + 30 * 3600_000)), START + 30 * 3600_000), null);
});

// --- `now`, the side that decides only HOW the early listing is described -

test("4. for a genuinely early listing, `now` flips only releasedYet - never earliness", () => {
  const row = listing("2026-09-10T12:00:00.000Z");
  for (const [label, clock, expected] of [
    ["one ms before the start", START - 1, false],
    ["exactly at the start", START, true],
    ["one ms after the start", START + 1, true],
    ["a week after the start", START + 7 * 86400_000, true],
  ]) {
    const early = earlyListing(row, clock);
    assert.ok(early, `${label}: still an early listing - the fact never expires`);
    assert.equal(early.releasedYet, expected, label);
  }
});

test("5. the presentation note follows the same boundary", () => {
  const row = listing("2026-09-10T12:00:00.000Z");
  const before = listingPresentation(row, START - 1);
  assert.equal(before.early, true);
  assert.match(before.notes.join(" "), /Upcoming — 30th Celebration releases/);

  const after = listingPresentation(row, START);
  assert.equal(after.early, true);
  assert.match(after.notes.join(" "), /30th Celebration released .* · this listing predates it/);

  // a listing first seen after release day is not early at either clock
  const late = listing(at(START + 1));
  assert.equal(listingPresentation(late, START + 1).early, false);
  assert.equal(listingPresentation(late, START + 30 * 3600_000).early, false);
});

test("6. an unknown discovery time stays early (conservative), at any clock", () => {
  for (const missing of [null, undefined, "", "not-a-date"]) {
    assert.ok(earlyListing(listing(missing), START + 86400_000), String(missing));
  }
});

test("7. a set outside the tracked releases is never early, whatever the clock", () => {
  const untracked = { ...listing("2026-09-10T12:00:00.000Z"), card_set: "Base Set" };
  assert.equal(earlyListing(untracked, START - 1), null);
  assert.equal(earlyListing(untracked, START + 86400_000), null);
});

// --- the fixture itself ---------------------------------------------------

test("8. the upcoming fixture is clock-independent and stays on the early side", () => {
  const up = DEAL_STATE_FIXTURES.find((f) => f.id === "bin_upcoming");
  const firstSeen = Date.parse(up.deal.first_seen_at);
  assert.ok(Number.isFinite(firstSeen), "a real instant");
  assert.ok(firstSeen < START, "the fixture is first seen before its expansion's release day");

  // it demonstrates the state at any clock, past or future - which is the
  // property that was missing
  for (const clock of [START - 86400_000, START, Date.now(), START + 365 * 86400_000]) {
    assert.equal(listingPresentation(up.deal, clock).early, true, `clock ${new Date(clock).toISOString()}`);
  }

  // pinned at the source: this one date may not be written from the clock
  const src = read("lib/dev/dealStateFixtures.js");
  const fixture = src.slice(src.indexOf('id: "bin_upcoming"'), src.indexOf('id: "auction"'));
  const code = fixture.replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /first_seen_at: "2026-09-10T12:00:00\.000Z"/, "an absolute instant");
  assert.doesNotMatch(code, /first_seen_at: (?:ago|ahead)\(/, "never relative to Date.now() - that is what aged out");
});

test("9. every other fixture stays clock-relative - only the calendar-bound one is pinned", () => {
  const src = read("lib/dev/dealStateFixtures.js").replace(/^\s*\/\/.*$/gm, "");
  const absolute = [...src.matchAll(/first_seen_at: "(\d{4}-\d{2}-\d{2}T[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(absolute, ["2026-09-10T12:00:00.000Z"], "exactly one absolute first_seen_at in the file");
  assert.match(src, /const ago = \(h\) => new Date\(NOW - h \* 3600 \* 1000\)\.toISOString\(\)/, "the relative helper is unchanged");
});
