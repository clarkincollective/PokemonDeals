// reader-consistency (15 Sep 2026) - the readers that select a column subset
// apply the same existing eligibility rules as the full-row gate:
//   * homepage / japanese-cards deal pool: the UNKNOWN-after-vision rule now
//     has its evidence (visual_authenticity_reason, server-side only);
//   * set / hub / species counts and the species prints section advertise
//     offers, so a held row or a blocking verdict never feeds them;
//   * catalogue printings are a separate, catalogue-sourced browse view.
// Fixture rows are synthetic (labelled); no network, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

register("../harness/ingestion/hooks.mjs", import.meta.url); // "@/lib/..." resolves to the repo
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const dq = require(join(ROOT, "lib/dealQuality.js"));
const { DEAL_POOL_SELECT, POOL_ROW_FIELDS, slimPoolRow } = await import(pathToFileURL(join(ROOT, "lib/dealPoolShape.mjs")).href);
const { computeAggregates } = await import(pathToFileURL(join(ROOT, "lib/catalogAggregates.js")).href);

const now = Date.now();
const iso = (h) => new Date(now - h * 3.6e6).toISOString();
// SYNTHETIC full row that passes every other gate (same shape as the ICH-5 control)
function row(id, over = {}) {
  const legacy = String(900000000000 + id);
  return {
    id, watchlist_id: 13372, source: "ebay", marketplace: "EBAY_US", listing_id: `v1|${legacy}|0`,
    title: "Pikachu & Zekrom GX (Full Art) 162/181 Sm-Team Up Holo",
    listing_url: `https://www.ebay.com/itm/${legacy}?_skw=x`,
    affiliate_url: `https://www.ebay.com/itm/${legacy}?_skw=x&mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339197414&customid=&toolid=10049`,
    image_url: "https://i.ebayimg.com/images/g/x/s-l1600.jpg", listing_type: "FIXED_PRICE", condition: "Near Mint",
    price: 84.99, shipping: 10, total_price: 94.99, total_price_usd: 94.99, market_price: 170.8, discount_pct: 0.4438, currency: "USD",
    seller_username: "s", seller_feedback_pct: 100, seller_feedback_score: 4929, image_count: 1, returns_accepted: false,
    card_name: "Pikachu & Zekrom GX (Full Art)", card_set: "SM - Team Up", card_language: "english", card_tcgplayer_id: "183805",
    is_active: true, is_graded: false, disqualified_reason: null, first_seen_at: iso(30), last_seen_at: iso(2), exact_verified_at: iso(2),
    visual_authenticity_status: null, visual_authenticity_reason: null,
    watchlist: { id: 13372, name: "Pikachu & Zekrom GX (Full Art)", set: "SM - Team Up", language: "english", justtcg_tcgplayer_id: "183805" },
    ...over,
  };
}
const poolShape = (r) => Object.fromEntries(DEAL_POOL_SELECT.split(", ").map((c) => [c, r[c] ?? null]));
const oldPoolShape = (r) => { const p = poolShape(r); delete p.visual_authenticity_reason; return p; };

const unknownAfterVision = row(1, { market_price: 300, total_price_usd: 80, total_price: 80, price: 70, discount_pct: 0.73, visual_authenticity_status: "UNKNOWN", visual_authenticity_reason: "vision:cannot confirm the print from the seller photo | stage1 stage1_inconclusive ratio=0.61" });
const unscreened = row(2);
const stage1Only = row(3, { market_price: 300, total_price_usd: 80, total_price: 80, price: 70, discount_pct: 0.73, visual_authenticity_status: "UNKNOWN", visual_authenticity_reason: "stage1 stage1_inconclusive ratio=0.55 | vision_unavailable" });
const heldResighted = row(4, { disqualified_reason: "review:copy_of_authenticity_hold", is_active: true, last_seen_at: iso(0), total_price_usd: 40, total_price: 40, price: 30 });
const genuine = row(5, { visual_authenticity_status: "MATCH", visual_authenticity_reason: "stage1 match" });

test("RC-1 deal pool: UNKNOWN after vision on a high-value, extreme-discount row is withheld - with the evidence the pool now reads; without it the pool showed it", () => {
  assert.equal(dq.isDisplayableDeal(unknownAfterVision), false);
  assert.equal(dq.disqualificationReason(unknownAfterVision), "authenticity:visual_unverified");
  assert.equal(dq.isDisplayableDeal(poolShape(unknownAfterVision)), false, "pool select carries the evidence");
  assert.equal(dq.isDisplayableDeal(oldPoolShape(unknownAfterVision)), true, "the previous select could not apply the rule");
  // the reason text never reaches the cached / client shape
  const slim = slimPoolRow(genuine);
  for (const k of ["visual_authenticity_reason", "visual_authenticity_status", "disqualified_reason"]) assert.ok(!(k in slim) && !POOL_ROW_FIELDS.includes(k), k);
});

test("RC-2 an ordinary unscreened row, and a stage-1-only UNKNOWN, keep their existing treatment on every surface", () => {
  for (const r of [unscreened, stage1Only]) {
    assert.equal(dq.isDisplayableDeal(poolShape(r)), true, `pool ${r.id}`);
    assert.equal(dq.isOfferCountable(r), true, `counts ${r.id}`);
  }
});

test("RC-3 a held row re-sighted as active is withheld from the pool, the counts and the species prints", () => {
  assert.equal(heldResighted.is_active, true);
  assert.equal(dq.isDisplayableDeal(poolShape(heldResighted)), false);
  assert.equal(dq.isOfferCountable(heldResighted), false);
  // aggregates: the held row neither counts nor sets the "from $X" price
  const agg = computeAggregates([genuine, row(6, { visual_authenticity_status: "MATCH" }), heldResighted]);
  const hub = agg.cardHubs.find((h) => h.id === 13372);
  assert.equal(hub.count, 2, "two genuine listings; the cheaper held one is not counted");
  assert.equal(hub.cheapestPrice, 94.99, "the held row's lower price is not advertised");
  const only = computeAggregates([genuine, heldResighted]);
  assert.equal(only.cardHubs.find((h) => h.id === 13372), undefined, "one genuine listing does not reach the hub minimum");
  // the same rule for the UNKNOWN-after-vision row
  assert.equal(dq.isOfferCountable(unknownAfterVision), false);
  assert.equal(computeAggregates([genuine, unknownAfterVision]).cardHubs.find((h) => h.id === 13372), undefined);
});

test("RC-4 a genuine eligible listing counts and displays; a catalogue printing without an offer stays a catalogue entry, never an offer", () => {
  assert.equal(dq.isDisplayableDeal(poolShape(genuine)), true);
  assert.equal(dq.isOfferCountable(genuine), true);
  assert.equal(computeAggregates([genuine, row(7, { visual_authenticity_status: "MATCH" })]).cardHubs.find((h) => h.id === 13372)?.count, 2);
  // the printings a visitor browses come from card_catalog; a print's `deal`
  // is null unless the scan found a live deal, and its price is the reference
  const deals = read("lib/deals.js");
  const browse = deals.slice(deals.indexOf("// The full BROWSE view of one species"), deals.indexOf("// The full BROWSE view of one species") + 1600);
  assert.match(browse, /card_catalog\s+- PPT reference: card existence/);
  assert.match(browse, /A card's `deal` field is null unless our scan found a live deal/);
  assert.match(browse, /`refPrice` is always the PPT reference, never presented as a deal/);
  // the catalogue set structures are built from card_catalog, independent of the deal snapshots
  assert.match(read("app/api/refresh-catalog/route.js"), /Independent of the deal snapshots above/);
});

test("RC-5 wiring: every offer-counting reader excludes held rows at the query and applies isOfferCountable; the pool select carries the verdict evidence", () => {
  const deals = read("lib/deals.js");
  assert.match(deals, /const OFFER_ELIGIBILITY_COLUMNS = "disqualified_reason, visual_authenticity_status, visual_authenticity_reason, market_price, discount_pct";/);
  assert.match(deals, /const AGGREGATE_SELECT =\s*\n\s*`total_price, total_price_usd, image_url, \$\{OFFER_ELIGIBILITY_COLUMNS\}/);
  assert.match(deals, /const AGGREGATE_SELECT_LEGACY =\s*\n\s*`total_price, image_url, \$\{OFFER_ELIGIBILITY_COLUMNS\}/);
  const scan = deals.slice(deals.indexOf("async function scanActiveDealRows"), deals.indexOf("async function readCatalogSnapshot"));
  assert.match(scan, /\.eq\("is_active", true\)\s*\n(?:\s*\/\/.*\n)*\s*\.is\("disqualified_reason", null\)/);
  const prints = deals.slice(deals.indexOf("async function fetchSpeciesPrintsUncached"), deals.indexOf("export const fetchSpeciesPrints"));
  assert.match(prints, /\$\{OFFER_ELIGIBILITY_COLUMNS\}/);
  assert.match(prints, /\.is\("disqualified_reason", null\)/);
  assert.match(prints, /for \(const row of \(data \?\? \[\]\)\.filter\(isOfferCountable\)\)/);
  assert.match(read("lib/catalogAggregates.js"), /rows = \(rows \?\? \[\]\)\.filter\(\(row\) => isOfferCountable\(row\) && savingsClaimTrusted\(row\)\);/);
  const snapshot = read("app/api/refresh-catalog/route.js");
  assert.match(snapshot, /\.eq\("is_active", true\)\s*\n(?:\s*\/\/.*\n)*\s*\.is\("disqualified_reason", null\)/);
  assert.ok(/const SELECT =\s*\n\s*"[^"]*visual_authenticity_reason[^"]*"/.test(snapshot) && /const SELECT_LEGACY =\s*\n\s*"[^"]*visual_authenticity_reason[^"]*"/.test(snapshot));
  for (const c of ["visual_authenticity_status", "visual_authenticity_reason", "disqualified_reason", "market_price", "discount_pct"]) assert.ok(DEAL_POOL_SELECT.includes(c), c);
  // isOfferCountable is only composed of existing rules: hold + visual verdict
  assert.match(read("lib/dealQuality.js"), /function isOfferCountable\(row\) \{\s*\n\s*if \(!row \|\| row\.is_active === false\) return false;\s*\n\s*if \(row\.disqualified_reason\) return false;\s*\n\s*if \(visualAuthenticityReason\(row\)\) return false;\s*\n\s*return true;/);
});
