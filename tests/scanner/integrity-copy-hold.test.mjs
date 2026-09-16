// integrity-copy-hold - regression for the owner-reported counterfeits of
// 15 Sep 2026 (deals 38616, 38617, 38618). Each was a NEW EBAY_GB row for an
// eBay item whose EBAY_US copy was already authenticity-held, and each became
// displayable at once. Fixture rows are the stored production shapes (ids,
// listing ids, titles, reasons, verdicts); the control is synthetic and
// labelled. No network, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const la = require(join(ROOT, "lib/listingAvailability.js"));
const { createMemoryDb } = await import(pathToFileURL(join(ROOT, "tests/harness/ingestion/memoryDb.mjs")).href);
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

const US = (over) => ({ source: "ebay", marketplace: "EBAY_US", is_active: true, disqualified_reason: null, visual_authenticity_status: null, ...over });
// the production EBAY_US copies as stored before the incident
const US_4220 = US({ id: 4220, listing_id: "v1|377438718184|0", watchlist_id: 13354, card_tcgplayer_id: "183806", seller_username: "bracoo1766", title: "Pokemon Pikachu & Zekrom GX 184/181 SM-Team Up Secret Rare Holo English 240HP", disqualified_reason: "authenticity:proxy_or_counterfeit", visual_authenticity_status: "UNKNOWN" });
const US_4247 = US({ id: 4247, listing_id: "v1|188677871472|0", watchlist_id: 13354, card_tcgplayer_id: "183806", seller_username: "rg.card.shark", is_active: false, title: "Pikachu & Zekrom GX (Secret) 184/181 Sm-Team Up Holo", disqualified_reason: "authenticity:proxy_or_counterfeit", visual_authenticity_status: "UNKNOWN" });
const US_38096 = US({ id: 38096, listing_id: "v1|267754207264|0", watchlist_id: 13372, card_tcgplayer_id: "183805", seller_username: "handiman38", title: "Pikachu & Zekrom GX (Full Art) 162/181 Sm-Team Up Holo", disqualified_reason: null, visual_authenticity_status: "COUNTERFEIT_MISMATCH" });
// the GB sightings the 15 Sep 10:00 UTC allocated run wrote
const gbSighting = (usRow, over = {}) => ({ source: "ebay", marketplace: "EBAY_GB", listing_id: usRow.listing_id, watchlist_id: usRow.watchlist_id, title: usRow.title, seller_username: usRow.seller_username, is_active: true, condition: "Near Mint", currency: "GBP", ...over });
const db = (rows) => createMemoryDb({ deals: rows.map((r) => ({ ...r })) }, { unique: { deals: ["source", "marketplace", "listing_id"] } });
const gbRow = (d, listingId) => d.tables.deals.find((r) => r.marketplace === "EBAY_GB" && r.listing_id === listingId);

test("ICH-1 the incident: a new copy of an authenticity-held eBay item is inserted under a review hold, never visible", async () => {
  for (const us of [US_4220, US_4247, US_38096]) {
    const d = db([us]);
    const w = await la.writeDiscoverySighting(d, gbSighting(us));
    assert.equal(w.outcome, "inserted", us.listing_id);
    assert.equal(w.heldReason, la.COPY_HOLD_REASON, us.listing_id);
    assert.equal(gbRow(d, us.listing_id).disqualified_reason, "review:copy_of_authenticity_hold");
    assert.equal(d.tables.deals.find((r) => r.id === us.id).disqualified_reason, us.disqualified_reason, "the flagged copy is untouched");
  }
  // an owner-reported copy holds its new copies the same way
  const owner = US({ id: 1, listing_id: "v1|900000000001|0", disqualified_reason: "review:owner_reported_counterfeit" });
  const d = db([owner]);
  assert.equal((await la.writeDiscoverySighting(d, gbSighting(owner))).heldReason, la.COPY_HOLD_REASON);
  // and a held copy's copies stay held (a third marketplace)
  const chain = db([{ ...owner, marketplace: "EBAY_GB", disqualified_reason: la.COPY_HOLD_REASON }]);
  assert.equal((await la.writeDiscoverySighting(chain, gbSighting(owner, { marketplace: "EBAY_CA" }))).heldReason, la.COPY_HOLD_REASON);
});

test("ICH-2 control: a genuine listing, and holds that are not about authenticity, insert exactly as before", async () => {
  // SYNTHETIC control: a clean EBAY_US copy screened MATCH
  const genuine = US({ id: 2, listing_id: "v1|900000000002|0", title: "Pikachu & Zekrom GX 33/181 Team Up Holo", visual_authenticity_status: "MATCH" });
  let d = db([genuine]);
  let w = await la.writeDiscoverySighting(d, gbSighting(genuine));
  assert.deepEqual([w.outcome, w.heldReason ?? null, gbRow(d, genuine.listing_id).disqualified_reason ?? null], ["inserted", null, null]);
  // no copy anywhere
  d = db([]);
  w = await la.writeDiscoverySighting(d, gbSighting(genuine));
  assert.equal(gbRow(d, genuine.listing_id).disqualified_reason ?? null, null);
  // sold, identity and language holds are not authenticity dispositions
  for (const reason of ["availability:sold", "identity:card_mismatch", "review:language_unverified"]) {
    d = db([{ ...genuine, disqualified_reason: reason }]);
    await la.writeDiscoverySighting(d, gbSighting(genuine));
    assert.equal(gbRow(d, genuine.listing_id).disqualified_reason ?? null, null, reason);
  }
  // no seller or card blanket: the same seller and the same card on a DIFFERENT eBay item are unaffected
  d = db([US_4220]);
  await la.writeDiscoverySighting(d, gbSighting(US_4220, { listing_id: "v1|900000000003|0" }));
  assert.equal(gbRow(d, "v1|900000000003|0").disqualified_reason ?? null, null);
});

test("ICH-3 an existing held row stays held when re-sighted; an unreadable copy check fails closed", async () => {
  const held = { ...gbSighting(US_4220), id: 38616, disqualified_reason: "review:owner_reported_counterfeit" };
  let d = db([US_4220, held]);
  const w = await la.writeDiscoverySighting(d, gbSighting(US_4220, { price: 80.01 }));
  assert.equal(w.outcome, "updated");
  assert.equal(d.tables.deals.find((r) => r.id === 38616).disqualified_reason, "review:owner_reported_counterfeit");
  assert.equal(d.tables.deals.find((r) => r.id === 38616).price, 80.01);
  // the copy read errors -> the new row is held, not assumed clean
  d = db([]);
  const from = d.from.bind(d);
  d.from = (t) => {
    const q = from(t);
    const select = q.select.bind(q);
    q.select = (cols, ...rest) => {
      const c = select(cols, ...rest);
      if (String(cols).includes("visual_authenticity_status")) return { eq: () => Promise.resolve({ data: null, error: { message: "injected" } }) };
      return c;
    };
    return q;
  };
  const f = await la.writeDiscoverySighting(d, gbSighting(US_4220));
  assert.equal(f.heldReason, la.COPY_CHECK_FAILED_REASON);
  assert.equal(gbRow(d, US_4220.listing_id).disqualified_reason, "review:copy_check_failed");
});

test("ICH-5 row 38096: the verdict was persisted but the hold was not - the gate hid it only where the verdict column was loaded; the screener now holds the row itself, and re-sightings keep the hold", async () => {
  const dq = require(join(ROOT, "lib/dealQuality.js"));
  const now = Date.now();
  // the stored EBAY_US row as it was from the 14 Sep 09:40 UTC verdict until containment
  const stored = {
    id: 38096, watchlist_id: 13372, source: "ebay", marketplace: "EBAY_US", listing_id: "v1|267754207264|0",
    title: "Pikachu & Zekrom GX (Full Art) 162/181 Sm-Team Up Holo",
    listing_url: "https://www.ebay.com/itm/267754207264?_skw=x&hash=item3e5764f820:g:vcwAAeSw3T9qe4aE",
    affiliate_url: "https://www.ebay.com/itm/267754207264?_skw=x&hash=item3e5764f820%3Ag%3AvcwAAeSw3T9qe4aE&mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339197414&customid=&toolid=10049",
    image_url: "https://i.ebayimg.com/images/g/vcwAAeSw3T9qe4aE/s-l1600.jpg", listing_type: "FIXED_PRICE", condition: "Near Mint",
    price: 84.99, shipping: 10, total_price: 94.99, total_price_usd: 94.99, market_price: 170.8, discount_pct: 0.4438, currency: "USD",
    seller_username: "handiman38", seller_feedback_pct: 100, seller_feedback_score: 4929, image_count: 1, returns_accepted: false,
    card_name: "Pikachu & Zekrom GX (Full Art)", card_set: "SM - Team Up", card_language: "english", card_tcgplayer_id: "183805",
    is_active: true, is_graded: false, disqualified_reason: null, first_seen_at: new Date(now - 30 * 3.6e6).toISOString(), last_seen_at: new Date(now - 2 * 3.6e6).toISOString(), exact_verified_at: new Date(now - 2 * 3.6e6).toISOString(),
    visual_authenticity_status: "COUNTERFEIT_MISMATCH", visual_authenticity_reason: "vision:Entire card is a metallic gold-plated novelty item | stage1 stage1_inconclusive ratio=0.37",
    visual_authenticity_checked_at: "2026-09-14T09:40:45.408Z",
  };
  // SYNTHETIC control: the same shape screened MATCH (its own eBay item)
  const genuine = { ...stored, id: 2, listing_id: "v1|900000000002|0", listing_url: "https://www.ebay.com/itm/900000000002?_skw=x", affiliate_url: "https://www.ebay.com/itm/900000000002?_skw=x&mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339197414&customid=&toolid=10049", visual_authenticity_status: "MATCH", visual_authenticity_reason: "stage1 match" };
  assert.equal(dq.isDisplayableDeal(genuine), true, "control is displayable (the fixture shape passes every other gate)");
  // 1. readers that load the verdict column withheld it (pool, inventory, detail, offers select the column)
  assert.equal(dq.isDisplayableDeal(stored), false);
  assert.equal(dq.disqualificationReason(stored), "authenticity:proxy_or_counterfeit");
  // 2. the defect: with only the row's persisted hold to go on, nothing withheld it -
  //    and the homepage deal pool selected exactly that column subset
  const { visual_authenticity_status, visual_authenticity_reason, ...withoutVerdictColumn } = stored;
  assert.equal(dq.isDisplayableDeal(withoutVerdictColumn), true, "no persisted hold: a column-limited reader counted it live");
  const { DEAL_POOL_SELECT } = await import(pathToFileURL(join(ROOT, "lib/dealPoolShape.mjs")).href);
  const poolRow = Object.fromEntries(DEAL_POOL_SELECT.split(", ").map((c) => [c, stored[c] ?? null]));
  assert.equal(dq.isDisplayableDeal(poolRow), false, "the pool select now carries the verdict to the gate");
  for (const c of ["visual_authenticity_status", "disqualified_reason"]) assert.ok(DEAL_POOL_SELECT.includes(c), c);
  // 3. the fix: the verdict persists the gate's own reason on the row; stronger reasons are kept; nothing else holds
  assert.deepEqual(la.authenticityVerdictHold({ status: "COUNTERFEIT_MISMATCH" }, stored), { disqualified_reason: "authenticity:proxy_or_counterfeit" });
  assert.deepEqual(la.authenticityVerdictHold({ status: "MISMATCH" }, stored), { disqualified_reason: "authenticity:proxy_or_counterfeit" });
  assert.equal(la.authenticityVerdictHold({ status: "COUNTERFEIT_MISMATCH" }, { ...stored, disqualified_reason: "review:owner_reported_counterfeit" }), null);
  for (const status of ["MATCH", "UNKNOWN", "IDENTITY_MISMATCH"]) assert.equal(la.authenticityVerdictHold({ status }, stored), null, status);
  const held = { ...withoutVerdictColumn, ...la.authenticityVerdictHold({ status: "COUNTERFEIT_MISMATCH" }, stored) };
  assert.equal(dq.isDisplayableDeal(held), false, "held even where the verdict column is not loaded");
  // 4. a normal re-sighting (dealRow shape: no reason column) updates the row but keeps the hold
  const d = db([held]);
  const w = await la.writeDiscoverySighting(d, gbSighting(held, { marketplace: "EBAY_US", price: 79.99, is_active: true, last_seen_at: new Date(now).toISOString() }));
  assert.equal(w.outcome, "updated");
  const after = d.tables.deals.find((r) => r.id === 38096);
  assert.deepEqual([after.price, after.disqualified_reason], [79.99, "authenticity:proxy_or_counterfeit"]);
  assert.equal(dq.isDisplayableDeal({ ...after, ...withoutVerdictColumn, disqualified_reason: after.disqualified_reason }), false);
  assert.ok(!la.isAvailabilityRetired(after), "not an availability retirement: verify-deals recovery never lifts it");
  // 5. the screener applies it, guarded, to the original row
  const screener = read("app/api/screen-visual-authenticity/route.js");
  assert.match(screener, /const own = authenticityVerdictHold\(verdict, row\);/);
  assert.match(screener, /db\.from\("deals"\)\.update\(own\)\.eq\("id", row\.id\)\.is\("disqualified_reason", null\)/);
});

test("ICH-4 every deals discovery path uses the guarded writer; the screener holds existing copies on a counterfeit verdict", () => {
  const route = read("app/api/refresh-deals/route.js");
  assert.match(route, /: await writeDiscoverySighting\(db, core\);/, "allocated / per-card scans");
  assert.match(route, /const \{ outcome, error \} = await writeDiscoverySighting\(db, core\);/, "sweep");
  assert.match(read("app/api/ingest-feed/route.js"), /await writeDiscoverySighting\(/, "competitor-board ingest");
  const src = read("lib/listingAvailability.js");
  // SEO-2.5 added a non-authoritative observation log after this call, so
  // the body is no longer a single return. The invariant this pins is
  // unchanged: discovery still goes through the guarded writer WITH the
  // copy-authenticity hold, and its result is what the caller receives.
  assert.match(src, /await writeGuardedSighting\(db, "deals", core, \{ insertHold: copyAuthenticityHold \}\);/);
  const fn = src.slice(src.indexOf("async function writeDiscoverySighting"), src.indexOf("let lastObservationOutcome"));
  assert.match(fn, /return result;/, "the guarded writer's result is returned unchanged");
  assert.doesNotMatch(fn, /result\s*=\s*await recordObservation/, "observation logging must not alter the result");
  const screener = read("app/api/screen-visual-authenticity/route.js");
  assert.match(screener, /"id, listing_id, card_name/);
  assert.match(screener, /update\(\{ disqualified_reason: COPY_HOLD_REASON \}\)\.eq\("listing_id", row\.listing_id\)\.neq\("id", row\.id\)\.is\("disqualified_reason", null\)/);
  for (const r of [la.COPY_HOLD_REASON, la.COPY_CHECK_FAILED_REASON, la.OWNER_REPORTED_COUNTERFEIT_REASON]) {
    assert.ok(!r.startsWith(la.AVAILABILITY_REASON_PREFIX), `${r} is never cleared by availability recovery or a sighting`);
  }
});
