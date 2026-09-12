// Deal-first R1-R2 - regression coverage for the independent-review
// findings (Codex review of fe7a535 vs 8b16321), exercised through the
// PRODUCTION data shape: rows go through lib/dealPoolShape.slimPoolRow (the
// real cache projection) before the display contract reads them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { slimPoolRow, POOL_ROW_FIELDS, DEAL_POOL_SELECT } from "../../lib/dealPoolShape.mjs";
import { offerShipping, shippingState } from "../../lib/offerPresentation.js";
import { auctionDisplayParts, currencyForDeal } from "../../lib/money.js";
import { buildHomepageLanes, LANES } from "../../lib/homepageVariety.js";
import { NAV_PRIMARY } from "../../lib/navLinks.js";
import { ALLOWED_EVENTS } from "../../lib/analytics/events.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// A raw row as the pool query returns it (subset of DEAL_POOL_SELECT).
function rawRow(over = {}) {
  return {
    id: 1, title: "Clefable Jungle 1/64 Holo", image_url: null, display_image_url: null, image_verdict: "CANONICAL_FALLBACK",
    affiliate_url: "https://www.ebay.com/itm/000000000001", listing_url: "https://www.ebay.com/itm/000000000001", listing_id: "000000000001",
    price: 26.5, shipping: 4.25, total_price: 30.75, total_price_usd: 30.75, market_price: 38.26, discount_pct: 0.196,
    condition: "Near Mint", is_graded: false, grade: null, grader: null,
    listing_type: "FIXED_PRICE", auction_end_at: null, bid_count: null,
    marketplace: "EBAY_US", is_local: true, item_location_country: "US",
    is_active: true, first_seen_at: "2026-09-13T01:00:00.000Z", last_seen_at: "2026-09-13T02:00:00.000Z", exact_verified_at: "2026-09-13T02:00:00.000Z",
    card_name: "Clefable", card_set: "Jungle", card_language: "english", card_tcgplayer_id: "45120", card_catalog_id: 10, watchlist_id: 20,
    disqualified_reason: null, image_count: 3, returns_accepted: true, seller_feedback_score: 500,
    ...over,
  };
}

// ---- P1: price/shipping survive the real cache projection ------------

test("P1-1. the slim pool row keeps price + shipping, and the select fetches them", () => {
  assert.ok(POOL_ROW_FIELDS.includes("price") && POOL_ROW_FIELDS.includes("shipping"));
  const sel = new Set(DEAL_POOL_SELECT.split(",").map((s) => s.trim()));
  assert.ok(sel.has("price") && sel.has("shipping"));
  const slim = slimPoolRow(rawRow());
  assert.equal(slim.price, 26.5);
  assert.equal(slim.shipping, 4.25);
});

test("P1-2. display contract through the projection: recorded charge -> Listing total / incl. shipping / unqualified saving", () => {
  const s = offerShipping(slimPoolRow(rawRow({ shipping: 4.25 })));
  assert.deepEqual([s.state, s.headline, s.note, s.savingQualifier, s.amount], ["confirmed", "Listing total", null, "", 4.25]);
});

test("P1-3. shipping = 0 through the projection -> Listing price / Shipping not confirmed / saving before shipping (never free)", () => {
  const s = offerShipping(slimPoolRow(rawRow({ shipping: 0, total_price: 26.5, total_price_usd: 26.5 })));
  assert.deepEqual([s.state, s.headline, s.note, s.savingQualifier], ["unconfirmed", "Listing price", "Shipping not confirmed", " before shipping"]);
  assert.equal(shippingState({ shipping: "0" }), "unconfirmed", "numeric strings from the driver behave the same");
});

test("P1-4. a legacy cached row WITHOUT the field is 'unknown': still 'Listing total' (the stored total may include a charge), still not confirmed, saving still qualified", () => {
  // simulate an entry written by the previous slim shape
  const legacy = slimPoolRow(rawRow());
  delete legacy.shipping;
  delete legacy.price;
  const s = offerShipping(legacy);
  assert.deepEqual([s.state, s.headline, s.note, s.savingQualifier], ["unknown", "Listing total", "Shipping not confirmed", " before shipping"]);
  assert.equal(offerShipping({ shipping: null }).state, "unknown");
  assert.equal(offerShipping({}).state, "unknown");
  assert.equal(offerShipping(null).state, "unknown");
  // never "Listing price" for a figure that may include shipping
  assert.notEqual(s.headline, "Listing price");
});

test("P1-4b. projection edge rows: DB null shipping -> unknown; non-USD row keeps native price/shipping; strings and NaN never confirm", () => {
  // shipping NULL in the database (not 0): unknown, never "Listing price"
  const dbNull = offerShipping(slimPoolRow(rawRow({ shipping: null })));
  assert.deepEqual([dbNull.state, dbNull.headline, dbNull.note, dbNull.amount], ["unknown", "Listing total", "Shipping not confirmed", null]);
  // a GB listing: shipping is in the listing currency, untouched by the projection
  const gb = slimPoolRow(rawRow({ marketplace: "EBAY_GB", item_location_country: "GB", is_local: false, price: 20, shipping: 3.5, total_price: 23.5, total_price_usd: 31.7 }));
  assert.equal(currencyForDeal(gb), "GBP");
  const s = offerShipping(gb);
  assert.deepEqual([s.state, s.amount, s.headline], ["confirmed", 3.5, "Listing total"]);
  assert.equal(gb.total_price_usd, 31.7, "the USD figure the card converts from survives too");
  // driver strings / garbage never confirm a charge
  assert.equal(offerShipping({ shipping: "4.25" }).state, "confirmed");
  assert.equal(offerShipping({ shipping: "abc" }).state, "unknown");
  assert.equal(offerShipping({ shipping: NaN }).state, "unknown");
  assert.equal(offerShipping({ shipping: -1 }).state, "unconfirmed", "a negative figure is not a recorded charge");
});

test("P1-5. the cache keys were bumped so entries of the older slim shape are not served to the new card", () => {
  const src = read("lib/deals.js");
  assert.match(src, /\["homepage-lanes-v3"\]/);
  assert.match(src, /\["deals-pool-v3"\]/);
});

test("P1-6. DealCard reads the shared contract - no private shipping rule", () => {
  const src = read("components/DealCard.js");
  assert.match(src, /import \{ offerShipping \} from "@\/lib\/offerPresentation"/);
  assert.match(src, /const ship = offerShipping\(deal\);/);
  assert.match(src, /\{ship\.headline\}/);
  assert.match(src, /\{ship\.savingQualifier\}/);
  assert.match(src, /data-shipping=\{ship\.state\}/);
  assert.doesNotMatch(src, /"Free shipping"|no shipping charge listed/);
});

// ---- auction limitation: unknown shipping is never a confirmed total ---

test("AUC-1. AuctionPrice: current bid from `price` (now in the slim row); shipping 0 -> 'Shipping not confirmed' and 'Est. total before shipping'", () => {
  const slim = slimPoolRow(rawRow({ listing_type: "AUCTION", bid_count: 3, price: 100, shipping: 0, total_price: 100, total_price_usd: 100 }));
  const parts = auctionDisplayParts(slim);
  assert.ok(parts, "the slim row carries the bid, so the split rendering is used (not the landed-total fallback)");
  assert.equal(parts.bid.native, 100);
  assert.equal(parts.shipping.native, 0);
  const ap = read("components/AuctionPrice.js");
  assert.match(ap, /const shippingConfirmed = shipping\.native > 0;/);
  assert.match(ap, /"Shipping not confirmed"/);
  assert.match(ap, /\{shippingConfirmed \? "Est\. total" : "Est\. total before shipping"\}/);
  assert.doesNotMatch(ap, /"Free shipping"/);
  // pre-existing fallback (no stored bid) is untouched: still an estimate, never "current bid"
  assert.equal(auctionDisplayParts({ ...slim, price: null }), null);
  assert.match(ap, /Est\. total\n\s*<\/p>/);
});

test("AUC-2. AuctionPrice fallback + non-USD through the projection: no stored bid -> landed-total fallback (never 'Current bid'); GB auction splits in GBP", () => {
  const noBid = slimPoolRow(rawRow({ listing_type: "AUCTION", bid_count: 2, price: null, shipping: 0, total_price: 40, total_price_usd: 40 }));
  assert.equal(auctionDisplayParts(noBid), null, "no bid stored -> the component's estimate fallback");
  const ap = read("components/AuctionPrice.js");
  const fbStart = ap.indexOf("if (!parts) {");
  const fallback = ap.slice(fbStart, ap.indexOf("\n  }\n", fbStart));
  assert.match(fallback, /Est\. total/);
  assert.doesNotMatch(fallback, /Current bid/, "the fallback never labels the landed total as the bid");
  const gb = slimPoolRow(rawRow({ marketplace: "EBAY_GB", item_location_country: "GB", is_local: false, listing_type: "AUCTION", bid_count: 1, price: 5.92, shipping: 12.42, total_price: 18.34, total_price_usd: 24.81 }));
  const parts = auctionDisplayParts(gb);
  assert.ok(parts);
  assert.equal(parts.bid.native, 5.92);
  assert.equal(parts.shipping.native, 12.42);
  assert.equal(currencyForDeal(gb), "GBP");
});

// ---- P3: hidden lanes must not reserve printings ----------------------

test("P3-1. buildHomepageLanes({ lanes }) selects only the rendered lanes; unlisted lanes are empty and claim nothing", () => {
  const mk = (id, tcg, name, set = "S") => ({ id, card_tcgplayer_id: tcg, card_catalog_id: tcg, watchlist_id: tcg, card_name: name, card_set: set, title: name, total_price: 10, total_price_usd: 10, listing_type: "FIXED_PRICE" });
  // the same printing (Charizard, key A) sits first in the under-price pool
  // AND in the grid pool. The grid pool is fillable WITHOUT it (three
  // Pikachu rows, species cap 3), so the default build never reaches the
  // last-resort relaxation level that re-admits a printing shown elsewhere;
  // and Charizard is the only row of its species/set, so when the grid is
  // the first lane to see it, it is taken at the first diversity level
  // whatever the bucket permutation says.
  const shared = mk(1, "A", "Charizard");
  const pools = {
    flagship: [mk(9, "F", "Venusaur", "F")],
    underPrice: [shared, mk(2, "B", "Blastoise")],
    justAdded: [mk(3, "C", "Gengar")],
    auctions: [mk(4, "D", "Mewtwo")],
    grid: [shared, mk(5, "E", "Pikachu", "P"), mk(6, "G", "Pikachu", "P"), mk(7, "H", "Pikachu", "P")],
  };
  const limits = { grid: 3 };
  const all = buildHomepageLanes(pools, { bucket: 1, limits });
  assert.equal(all.underPrice.length, 2, "default: every lane is built (other callers unchanged)");
  assert.equal(all.grid.length, 3);
  assert.ok(!all.grid.some((d) => d.id === 1), "default: the under-price lane reserved printing A away from the grid");
  const rendered = buildHomepageLanes(pools, { bucket: 1, limits, lanes: ["flagship", "grid"] });
  assert.equal(rendered.grid.length, 3);
  assert.deepEqual(rendered.underPrice, []);
  assert.deepEqual(rendered.justAdded, []);
  assert.deepEqual(rendered.auctions, []);
  assert.ok(rendered.grid.some((d) => d.id === 1), "rendered-only: printing A is available to the grid");
  assert.equal(rendered.flagship[0].id, 9, "flagship still picks first");
  assert.ok(!rendered.grid.some((d) => d.id === 9), "flagship still excludes its pick from the grid");
  // lane contract untouched
  assert.deepEqual(LANES().map((l) => l.key), ["flagship", "underPrice", "justAdded", "auctions", "grid"]);
  assert.match(read("app/page.js"), /buildHomepageLanes\(homeLanesResult\?\.pools \?\? \{\}, \{ bucket, lanes: \["flagship", "grid"\] \}\)/);
});

// ---- P2: the mixed default feed is not labelled "Buy it now" ---------

test("P2-1. default feed labelled Featured; 'Buy it now' is the existing FIXED_PRICE filter", () => {
  const page = read("app/page.js");
  assert.match(page, /label: "Featured", chip: "featured", home: true/);
  assert.match(page, /href: "\/\?listing=FIXED_PRICE", label: "Buy it now"/);
  assert.match(page, /"Featured · below market · buy it now and auctions"/);
  assert.doesNotMatch(page, /kicker=\{anyFilter \? "Filtered" : "Buy it now/);
});

// ---- P4: graded_clicked via the shared nav model, once per click -----

test("P4-1. graded_clicked is declared on the nav model and emitted by every renderer exactly once (no special-case, no double marker)", () => {
  const graded = NAV_PRIMARY.find((l) => l.href === "/deals/graded");
  assert.equal(graded.analyticsClick, "graded_clicked");
  assert.deepEqual(graded.analyticsProps, { section: "nav", source: "nav", graded_entry: true });
  assert.ok(ALLOWED_EVENTS.has("graded_clicked"));
  for (const f of ["components/SiteHeader.js", "components/NavDropdown.js", "components/NavMenu.js", "components/SiteFooter.js"]) {
    const src = read(f);
    assert.doesNotMatch(src, /"graded_clicked"/, `${f} must not hard-code the graded event`);
    assert.equal((src.match(/data-analytics-click=/g) ?? []).length >= 1, true, `${f} emits model markers`);
  }
  // the bootstrap only ADDS a graded_clicked when the marker is not already it
  const boot = read("components/analytics/AnalyticsBootstrap.js");
  assert.match(boot, /props\.graded_entry && name !== EVENTS\.GRADED_CLICKED/);
  // the footer labels its population; the menu / dropdown carry the model props
  assert.match(read("components/SiteFooter.js"), /JSON\.stringify\(\{ \.\.\.\(l\.analyticsProps \?\? \{\}\), source: "footer" \}\)/);
  assert.match(read("components/NavMenu.js"), /JSON\.stringify\(link\.analyticsProps \?\? \{\}\)/);
  const latest = NAV_PRIMARY.find((l) => l.href === "/latest-releases");
  assert.equal(latest.analyticsClick, "latest_releases_clicked");
});

test("P5-2. the measurement doc's mode count and new nav populations match the page and the model", () => {
  const page = read("app/page.js");
  const chips = [...page.matchAll(/chip: "([a-z_0-9]+)"/g)].map((m) => m[1]);
  assert.deepEqual(chips, ["featured", "buy_it_now", "auctions", "graded", "under_25", "under_50", "sealed", "japanese", "newest"]);
  const doc = read("docs/deal-first-measurement.md");
  assert.match(doc, /nine chips \(featured, buy_it_now, auctions, graded, under_25, under_50, sealed, japanese, newest\)/);
  assert.doesNotMatch(doc, /eight chips/);
  for (const ev of ["graded_clicked", "latest_releases_clicked"]) assert.ok(doc.includes(`\`${ev}\``), `${ev} documented`);
  assert.match(doc, /source: "footer"/);
});

// ---- P5: measurement doc uses the real attribution values ---------------

test("P5-1. the measurement doc names the emitted origin_section values and keeps EPN customid separate", () => {
  const doc = read("docs/deal-first-measurement.md");
  for (const s of ["ending_soon", "just_added", "under_25", "best_deals", "home_all_deals"]) assert.ok(doc.includes(`\`${s}\``), `origin_section ${s}`);
  assert.match(doc, /EPN `customid`/);
  assert.doesNotMatch(doc, /origin_section` `home_ending`|origin_section` `home_fresh`|origin_section` `home_under25`/, "pageNames are not origin_section values");
  assert.match(doc, /Vercel Web Analytics/);
});
