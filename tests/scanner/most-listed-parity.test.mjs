// SEO Phase 9A closeout - "Most-Listed Pokemon Cards" must count only
// listings the site would actually display. The ranking aggregate
// (fetchMostListedCards in lib/deals.js) computes its per-card count by
// running the SHARED gate isDisplayableDeal over a select("*") scan of
// active English deal rows. These tests pin:
//   - the aggregate uses isDisplayableDeal (not a private copy / a raw
//     is_active count)
//   - it selects the COMPLETE row (select "*") so the gate can never be
//     starved of a column it reads (the sitemap bug was a hand-picked
//     projection that dropped visual-authenticity columns)
//   - the gate itself excludes every rejection class by characteristic,
//     with no deal-ID special casing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isDisplayableDeal } from "../../lib/dealQuality.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEALS_SRC = readFileSync(join(HERE, "..", "..", "lib", "deals.js"), "utf8");

// The body of fetchMostListedCardsUncached.
const FN_SRC = (() => {
  const start = DEALS_SRC.indexOf("async function fetchMostListedCardsUncached");
  assert.ok(start > 0, "fetchMostListedCardsUncached not found in lib/deals.js");
  // up to the matching export const wrapper
  const end = DEALS_SRC.indexOf("export const fetchMostListedCards ", start);
  return DEALS_SRC.slice(start, end > start ? end : start + 4000);
})();

const HOUR = 3_600_000;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();
const ahead = (h) => new Date(Date.now() + h * HOUR).toISOString();

// A fully-populated, otherwise-clean displayable deal row.
const deal = (over = {}) => ({
  id: 1,
  is_active: true,
  is_graded: false,
  title: "Charizard GX 9/68 SM Hidden Fates Holo Rare",
  condition: "Near Mint",
  card_language: "english",
  card_name: "Charizard GX",
  card_set: "SM - Hidden Fates",
  market_price: 40,
  discount_pct: 0.3,
  listing_type: "FIXED_PRICE",
  auction_end_at: null,
  last_seen_at: ago(1),
  listing_id: "v1|123456789012|0",
  listing_url: "https://www.ebay.com/itm/123456789012?x=1",
  affiliate_url: "https://www.ebay.com/itm/123456789012?x=1&campid=5",
  disqualified_reason: null,
  visual_authenticity_status: null,
  visual_authenticity_reason: null,
  image_count: 6,
  returns_accepted: true,
  seller_feedback_score: 5000,
  ...over,
});

// === the aggregate wiring ==============================================

test("fetchMostListedCards computes its count with the shared isDisplayableDeal gate", () => {
  assert.match(
    DEALS_SRC,
    /import \{[^}]*isDisplayableDeal[^}]*\} from "@\/lib\/dealQuality"/,
    "lib/deals.js does not import isDisplayableDeal"
  );
  assert.match(FN_SRC, /if \(!isDisplayableDeal\(row\)\) continue/, "aggregate does not gate rows on isDisplayableDeal");
  // it must NOT fall back to a raw is_active row count for the ranking
  assert.doesNotMatch(FN_SRC, /\.count\s*\+\+[^]*?is_active/i);
});

test("the aggregate scan selects the COMPLETE row (select \"*\") - no hand-picked projection to starve the gate", () => {
  // select("*, watchlist:...") - the leading "*" is what guarantees every
  // column isDisplayableDeal reads is present. A comma-list here would be
  // the sitemap incomplete-projection bug all over again.
  assert.match(FN_SRC, /\.select\(\s*["'`]\*/, "aggregate does not select \"*\"");
  assert.match(FN_SRC, /\.eq\("is_active",\s*true\)/, "aggregate does not restrict to active rows");
});

test("no deal-ID special casing anywhere in the aggregate", () => {
  assert.doesNotMatch(FN_SRC, /24195/);
  assert.doesNotMatch(FN_SRC, /\bid\s*===?\s*\d/);
  assert.doesNotMatch(FN_SRC, /\bid\s*!==?\s*\d/);
});

test("the aggregate does not mutate computeAggregates / fetchCardHubs count semantics", () => {
  // it reuses fetchCardHubs only for identity + slug, and derives its own count
  assert.match(FN_SRC, /fetchCardHubs\(\{ language \}\)/);
  assert.match(FN_SRC, /count:\s*displayable\.get\(h\.id\)/);
  // computeAggregates is not imported/called here
  assert.doesNotMatch(FN_SRC, /computeAggregates/);
});

// === the gate excludes every rejection class, by characteristic ========

test("1. a clean, fresh, displayable listing counts", () => {
  assert.equal(isDisplayableDeal(deal()), true);
});

test("2. an inactive listing does not count", () => {
  assert.equal(isDisplayableDeal(deal({ is_active: false })), false);
});

test("3. a COUNTERFEIT_MISMATCH listing does not count", () => {
  assert.equal(
    isDisplayableDeal(deal({ visual_authenticity_status: "COUNTERFEIT_MISMATCH", visual_authenticity_reason: "manual: gold-metal novelty" })),
    false
  );
});

test("4. an IDENTITY_MISMATCH listing does not count", () => {
  assert.equal(
    isDisplayableDeal(deal({ visual_authenticity_status: "IDENTITY_MISMATCH", visual_authenticity_reason: "vision: wrong print" })),
    false
  );
  // legacy single-bucket verdict too
  assert.equal(isDisplayableDeal(deal({ visual_authenticity_status: "MISMATCH" })), false);
});

test("5. a stale listing (past its value-tier TTL) does not count", () => {
  assert.equal(isDisplayableDeal(deal({ market_price: 500, last_seen_at: ago(80) })), false);
});

test("6. an ended auction does not count", () => {
  assert.equal(
    isDisplayableDeal(deal({ listing_type: "AUCTION", auction_end_at: ago(1), last_seen_at: ago(0.5) })),
    false
  );
  // a still-live auction does
  assert.equal(
    isDisplayableDeal(deal({ listing_type: "AUCTION", auction_end_at: ahead(6), last_seen_at: ago(1) })),
    true
  );
});

test("7. a wrong-language listing does not count", () => {
  assert.equal(isDisplayableDeal(deal({ title: "Charizard GX 9/68 SM Hidden Fates Japanese Holo" })), false);
});

test("8. a non-exact CTA (points at /p/ not /itm/) does not count", () => {
  assert.equal(
    isDisplayableDeal(deal({ affiliate_url: "https://www.ebay.com/p/24043367539", listing_url: "https://www.ebay.com/p/24043367539" })),
    false
  );
});

test("9. a high-risk-below-market listing does not count", () => {
  assert.equal(
    isDisplayableDeal(deal({ discount_pct: 0.78, seller_feedback_score: 10, image_count: 1, returns_accepted: false })),
    false
  );
});

test("10. an unverifiable-raw-condition listing does not count (the dominant real rejection reason)", () => {
  // no wear signal anywhere + an uninformative stored condition -> Unknown
  // -> not promotable. This is ~79% of the rejected rows in production.
  assert.equal(
    isDisplayableDeal(deal({ condition: "Ungraded", title: "Charizard GX 9/68 SM Hidden Fates" })),
    false
  );
});

test("11. an explicit stored disqualified_reason does not count", () => {
  assert.equal(isDisplayableDeal(deal({ disqualified_reason: "identity:card_mismatch" })), false);
});

test("12. a deal-24195-shaped counterfeit is excluded by characteristic, not by id", () => {
  const d = deal({
    id: 24195,
    condition: "Near Mint",
    disqualified_reason: null,
    visual_authenticity_status: "COUNTERFEIT_MISMATCH",
    visual_authenticity_reason: "manual:gold_metal_novelty",
  });
  assert.equal(isDisplayableDeal(d), false);
  assert.equal(isDisplayableDeal({ ...d, id: 999999 }), false); // id is irrelevant
});
