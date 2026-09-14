// SOCIAL-LIVE-1 (2026-09-14) - fixes found while taking the social
// pipeline live:
//   1. deal-sourced social facts pass the site's full display gate
//   2. printing comparisons are like-for-like on condition and edition
//   3. refill curation diversity is per platform feed
//   4. owner-approved cadence (~2/day per platform, Australia/Brisbane) and
//      a single near-term launch slot
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const MD = await import(pathToFileURL(join(REPO, "lib/social/newsroom/marketData.mjs")).href);
const RF = await import(pathToFileURL(join(REPO, "lib/newsroom/backlogRefill.mjs")).href);
const { DEAL_STATE_FIXTURES } = await import(pathToFileURL(join(REPO, "lib/dev/dealStateFixtures.js")).href);

test("SL1-1. printing pairs: a condition mismatch or an edition-specific price on a multi-edition product is rejected (the live Charizard case)", () => {
  const shadowless = { name: "Charizard", set: "Base Set (Shadowless)", card_number: "004/102", market_price: 2257.87, market_condition: "Lightly Played", market_printing: "Unlimited Holofoil" };
  const legendary = { name: "Charizard", set: "Legendary Collection", card_number: "003/110", market_price: 899.99, market_condition: "Near Mint", market_printing: "Holofoil" };
  assert.equal(MD.printingPairComparable(shadowless, legendary).ok, false);
  assert.match(MD.printingPairComparable({ ...shadowless, market_condition: "Near Mint" }, legendary).reason, /multi-edition/);
  assert.match(MD.printingPairComparable({ ...legendary, market_condition: null }, legendary).reason, /missing/);
  const baseSet = { name: "Charizard", set: "Base Set", card_number: "004/102", market_price: 869.02, market_condition: "Near Mint", market_printing: "Holofoil" };
  assert.equal(MD.printingPairComparable(legendary, baseSet).ok, true);
});

test("SL1-2. deal-sourced facts need the full display gate: a quarantined or stale deal is never a social fact", () => {
  const fx = (id) => ({ ...DEAL_STATE_FIXTURES.find((f) => f.id === id).deal, is_active: true, card_language: "english" });
  const ok = fx("bin_compared");
  assert.equal(MD.socialDealUsable(ok), true);
  assert.equal(MD.socialDealUsable({ ...ok, disqualified_reason: "identity:language_conflict" }), false);
  assert.equal(MD.socialDealUsable({ ...ok, disqualified_reason: "review:language_unverified" }), false);
  assert.equal(MD.socialDealUsable({ ...ok, last_seen_at: "2026-01-01T00:00:00Z", exact_verified_at: "2026-01-01T00:00:00Z" }), false);
  const src = read("lib/social/newsroom/marketData.mjs");
  assert.match(src, /const DEAL_COLS = "\*";/);
  assert.match(src, /dealQuality\.isDisplayableDeal\(d\) && dealQuality\.savingsClaimTrusted\(d\)/);
  assert.doesNotMatch(src, /DEAL_COLS \+ /);
});

test("SL1-3. cadence: two Brisbane slots a day per platform; a launch slot comes first only when it is in the future", () => {
  const now = Date.parse("2026-09-14T05:30:00Z"); // 15:30 Brisbane
  const toBris = (iso) => new Date(Date.parse(iso) + 10 * 3_600_000).toISOString().slice(11, 16);
  assert.deepEqual(RF.slotsFor("instagram", 4, now).map(toBris), ["10:00", "18:00", "10:00", "18:00"]);
  assert.deepEqual(RF.slotsFor("x", 4, now).map(toBris), ["08:00", "16:00", "08:00", "16:00"]);
  const launch = new Date(now + 20 * 60_000).toISOString();
  const s = RF.slotsFor("instagram", 3, now, { launchAt: launch });
  assert.equal(s[0], launch);
  assert.equal(s.length, 3);
  assert.equal(RF.slotsFor("x", 2, now, { launchAt: new Date(now - 60_000).toISOString() })[0], RF.slotsFor("x", 2, now)[0], "a past launch time is ignored");
  assert.deepEqual(RF.REFILL_SLOT_HOURS_BRISBANE, { instagram: [10, 18], x: [8, 16] });
});

test("SL1-4. refill curation diversity is per platform feed, and the CLI launch flag is bounded", () => {
  const src = read("lib/newsroom/backlogRefill.mjs");
  assert.match(src, /const ps = \(pickedSeries\[e\.p\.platform\] \?\?= new Set\(\)\);/);
  assert.match(src, /if \(ps\.has\(e\.st\.series\) && pl\.has\(lf\)\) continue;/);
  assert.doesNotMatch(src, /pickedSeries\.has\(e\.st\.series\) && pickedLayout\.has\(lf\)/);
  const cli = read("scripts/socialBacklog.mjs");
  assert.match(cli, /launchMin >= 65/);
  assert.match(cli, /refillQueueReconcile\(\{ dryRun: !enabled, initial: true, launchAt \}\)/);
});
