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

test("ICH-4 every deals discovery path uses the guarded writer; the screener holds existing copies on a counterfeit verdict", () => {
  const route = read("app/api/refresh-deals/route.js");
  assert.match(route, /: await writeDiscoverySighting\(db, core\);/, "allocated / per-card scans");
  assert.match(route, /const \{ outcome, error \} = await writeDiscoverySighting\(db, core\);/, "sweep");
  assert.match(read("app/api/ingest-feed/route.js"), /await writeDiscoverySighting\(/, "competitor-board ingest");
  const src = read("lib/listingAvailability.js");
  assert.match(src, /return writeGuardedSighting\(db, "deals", core, \{ insertHold: copyAuthenticityHold \}\);/);
  const screener = read("app/api/screen-visual-authenticity/route.js");
  assert.match(screener, /"id, listing_id, card_name/);
  assert.match(screener, /update\(\{ disqualified_reason: COPY_HOLD_REASON \}\)\.eq\("listing_id", row\.listing_id\)\.neq\("id", row\.id\)\.is\("disqualified_reason", null\)/);
  for (const r of [la.COPY_HOLD_REASON, la.COPY_CHECK_FAILED_REASON, la.OWNER_REPORTED_COUNTERFEIT_REASON]) {
    assert.ok(!r.startsWith(la.AVAILABILITY_REASON_PREFIX), `${r} is never cleared by availability recovery or a sighting`);
  }
});
