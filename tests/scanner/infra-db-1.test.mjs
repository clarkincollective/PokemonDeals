// Phase INFRA-DB-1 - deal-pool cache shrink + Supabase pressure guardrails.
// Pure-logic + source-scan. No DB, no network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  DEAL_POOL_MAX_ROWS,
  DEAL_POOL_SELECT,
  POOL_ROW_FIELDS,
  slimPoolRow,
} from "../../lib/dealPoolShape.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const NEXT_CACHE_LIMIT = 2 * 1024 * 1024;
const HEADROOM_TARGET = 1.6 * 1024 * 1024; // < 2 MB with real headroom

// A realistically-heavy synthetic deal row (long eBay title, real-length
// affiliate + image URLs) so the byte budget is a worst-case, not a
// best-case, estimate.
function heavyRow(i) {
  return {
    id: 100000 + i,
    title: "Pokemon 2024 Surging Sparks Pikachu ex 238/191 Special Illustration Rare PSA 10 GEM MINT " + i,
    image_url: "https://i.ebayimg.com/images/g/AbCdEfGhIjKlMnOp/s-l1600.jpg",
    display_image_url: "https://i.ebayimg.com/images/g/AbCdEfGhIjKlMnOp/s-l1600.webp",
    image_verdict: "SELLER_FRONT",
    affiliate_url: "https://www.ebay.com/itm/" + (200000000000 + i) + "?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339112895&customid=deal&toolid=10001&mkevt=1",
    listing_url: "https://www.ebay.com/itm/" + (200000000000 + i),
    listing_id: String(200000000000 + i),
    price: 123.45, shipping: 4.99, total_price: 128.44, total_price_usd: 128.44,
    market_price: 260.0, discount_pct: 0.507,
    condition: "Near Mint", is_graded: false, grade: null, grader: null,
    listing_type: i % 5 === 0 ? "AUCTION" : "FIXED_PRICE",
    auction_end_at: i % 5 === 0 ? "2026-09-12T04:00:00.000Z" : null,
    bid_count: i % 5 === 0 ? 7 : null,
    marketplace: "EBAY_US", is_local: true, item_location_country: "US",
    is_active: true,
    first_seen_at: "2026-09-08T12:34:56.000Z",
    last_seen_at: "2026-09-08T18:00:00.000Z",
    exact_verified_at: "2026-09-08T17:30:00.000Z",
    card_name: "Pikachu ex", card_set: "Surging Sparks", card_language: "english",
    card_tcgplayer_id: String(600000 + i), card_catalog_id: 700000 + i, watchlist_id: 800000 + i,
    disqualified_reason: null, image_count: 12, returns_accepted: true, seller_feedback_score: 4213,
    visual_authenticity_reason: "front image matches the canonical printing; holo pattern consistent",
    image_urls: Array.from({ length: 12 }, (_, k) => "https://i.ebayimg.com/images/g/x" + k + "/s-l1600.jpg"),
  };
}

// ---- payload budget ------------------------------------------------
test("IDB-1. a full-ceiling pool of slim rows serialises well under the 2 MB cache limit", () => {
  const rows = Array.from({ length: DEAL_POOL_MAX_ROWS }, (_, i) => slimPoolRow(heavyRow(i)));
  const bytes = Buffer.byteLength(JSON.stringify(rows), "utf8");
  assert.ok(bytes < NEXT_CACHE_LIMIT, `slim pool ${(bytes / 1048576).toFixed(2)} MB must be < 2 MB`);
  assert.ok(bytes < HEADROOM_TARGET, `slim pool ${(bytes / 1048576).toFixed(2)} MB must keep headroom (< 1.6 MB)`);
});

test("IDB-2. the projection is a real reduction vs the raw row", () => {
  const raw = heavyRow(1);
  const slim = slimPoolRow(raw);
  const rawB = Buffer.byteLength(JSON.stringify(raw), "utf8");
  const slimB = Buffer.byteLength(JSON.stringify(slim), "utf8");
  assert.ok(slimB < rawB * 0.75, `slim row ${slimB}B should be < 75% of raw ${rawB}B`);
  // the heaviest raw-only fields are gone
  for (const gone of ["image_urls", "visual_authenticity_reason", "listing_url", "listing_id", "price", "shipping", "seller_feedback_score", "item_location_country"]) {
    assert.ok(!(gone in slim), `slim row must not carry ${gone}`);
  }
});

test("IDB-3. slimPoolRow is idempotent", () => {
  const once = slimPoolRow(heavyRow(3));
  const twice = slimPoolRow(once);
  assert.deepEqual(twice, once);
});

// ---- consumer parity: every field a pool consumer reads survives ---
const DEALCARD_NEEDS = [
  "id", "title", "image_url", "display_image_url", "image_verdict", "affiliate_url",
  "total_price", "total_price_usd", "market_price", "discount_pct",
  "listing_type", "auction_end_at", "bid_count", "is_graded", "grade", "grader", "condition",
  "marketplace", "first_seen_at", "card_tcgplayer_id",
];
const FRESHNESS_NEEDS = ["listing_type", "auction_end_at", "last_seen_at", "first_seen_at"];
const DIVERSITY_NEEDS = ["card_tcgplayer_id", "card_catalog_id", "watchlist_id", "card_name", "card_set", "total_price", "total_price_usd", "id", "title"];

test("IDB-4. slim shape keeps every field DealCard / dealFreshness / homepageVariety read", () => {
  const slim = slimPoolRow(heavyRow(4));
  for (const f of new Set([...DEALCARD_NEEDS, ...FRESHNESS_NEEDS, ...DIVERSITY_NEEDS])) {
    assert.ok(f in slim, `slim pool row is missing consumer field: ${f}`);
  }
  assert.ok(slim.watchlist && typeof slim.watchlist === "object", "watchlist object must be synthesised");
  assert.equal(slim.watchlist.justtcg_tcgplayer_id, slim.card_tcgplayer_id);
});

test("IDB-5. a real watchlist embed is preserved, not overwritten by the synthetic one", () => {
  const raw = { ...heavyRow(5), watchlist: { name: "Real Name", set: "Real Set", language: "english", justtcg_tcgplayer_id: "999" } };
  const slim = slimPoolRow(raw);
  assert.equal(slim.watchlist.name, "Real Name");
  assert.equal(slim.watchlist.justtcg_tcgplayer_id, "999");
});

// ---- select covers the pre-cache gate + the stored shape ----------
test("IDB-6. DEAL_POOL_SELECT is a superset of the stored fields and the display-gate inputs", () => {
  const sel = new Set(DEAL_POOL_SELECT.split(",").map((s) => s.trim()));
  for (const f of POOL_ROW_FIELDS) assert.ok(sel.has(f), `select missing stored field ${f}`);
  // isDisplayableDeal / isExactEbayDealDestination / conditionLabel inputs
  for (const f of ["is_active", "disqualified_reason", "listing_url", "listing_id", "affiliate_url", "condition", "title", "market_price", "discount_pct", "card_name", "card_set", "card_language", "is_graded", "grade", "grader", "returns_accepted", "image_count", "seller_feedback_score", "listing_type"]) {
    assert.ok(sel.has(f), `select missing display-gate input ${f}`);
  }
  // it must NOT re-introduce the heavy columns
  for (const heavy of ["image_urls", "visual_authenticity_reason", "visual_authenticity_checked_at", "image_checked_at"]) {
    assert.ok(!sel.has(heavy), `select must not fetch heavy column ${heavy}`);
  }
});

// ---- deals.js wiring ---------------------------------------------
test("IDB-7. fetchDealsPool uses the slim select + ceiling + projection, keeps the gate, and stays ONE query (no N+1)", () => {
  const src = code("lib/deals.js");
  const fn = src.slice(src.indexOf("async function fetchDealsPoolUncached"), src.indexOf("export const fetchDealsPool"));
  assert.match(fn, /DEAL_POOL_SELECT/);
  assert.match(fn, /\.limit\(DEAL_POOL_MAX_ROWS\)/);
  assert.doesNotMatch(fn, /\.select\(\s*["'`]\*/); // no select("*")
  assert.doesNotMatch(fn, /\.limit\(2000\)/);
  assert.match(fn, /displayable\(data\)/);         // gate still runs
  assert.match(fn, /\.map\(slimPoolRow\)/);        // stored rows projected
  // exactly one supabase .from("deals") read in this function - no per-row loop
  assert.equal((fn.match(/supabase\s*\n?\s*\.from\(/g) || fn.match(/\.from\("deals"\)/g) || []).length <= 1, true);
  assert.doesNotMatch(fn, /for\s*\(.*of.*\)\s*\{[\s\S]*await supabase/); // no loop-with-await query
});

test("IDB-8. the pool + homepage-lanes cache keys were bumped so a stale full-size entry is not reused", () => {
  const src = read("lib/deals.js");
  assert.match(src, /\["deals-pool-v2"\]/);
  assert.match(src, /\["homepage-lanes-v2"\]/);
  assert.doesNotMatch(src, /\["deals-pool"\]/);
  assert.doesNotMatch(src, /\["homepage-lanes-v1"\]/);
});

test("IDB-9. every homepage lane pool is slimmed before it enters the homepage-lanes cache entry", () => {
  const src = code("lib/deals.js");
  const fn = src.slice(src.indexOf("async function fetchHomepageLanesUncached"), src.indexOf("export const fetchHomepageLanes"));
  // flagship / justAdded / underPrice / auctions all project; grid comes
  // from fetchDealsPoolUncached which already returns slim rows.
  assert.ok((fn.match(/slimPoolRow/g) || []).length >= 4, "expected >=4 slimPoolRow projections in the lanes builder");
});

// ---- VERCEL-COST-1 not reverted -------------------------------
test("IDB-10. VERCEL-COST-1 pool/ISR/image changes are intact", () => {
  const src = read("lib/deals.js");
  assert.match(src, /POOL_REVALIDATE_SECONDS = 180/);
  const next = read("next.config.mjs");
  assert.match(next, /image\/webp/);
  assert.match(next, /minimumCacheTTL/);
});

// ---- SAFETY: nothing else touched ----------------------------
test("IDB-11. INFRA-DB-1 does not touch verify-deals, the verify allocator, scanner cadence, or eBay Browse", () => {
  for (const p of ["lib/dealPoolShape.mjs", "scripts/infraDbHealth.mjs"]) {
    const c = code(p);
    assert.doesNotMatch(c, /verifyAllocator|allocateVerifyBatch|api\/verify-deals|refresh-deals|ebayBrowse|\/buy\/browse/i, `${p} must not reference verify / scanner / Browse`);
  }
  // vercel.json cron cadence unchanged for the protected jobs
  const v = JSON.parse(read("vercel.json"));
  const byPath = Object.fromEntries(v.crons.map((c) => [c.path, c.schedule]));
  assert.equal(byPath["/api/verify-deals"], "*/30 * * * *");
  assert.equal(byPath["/api/social-auto"], "0 * * * *");
});

test("IDB-12. the social / newsroom source path does not import the web deal pool", () => {
  for (const p of ["scripts/socialSource.mjs", "lib/social/newsroom/marketData.mjs", "lib/autonomous/socialPublish.mjs"]) {
    let c;
    try { c = read(p); } catch { continue; }
    assert.doesNotMatch(c, /from ["'].*dealPoolShape|fetchDealsPool|fetchHomepageLanes/, `${p} must not depend on the web deal pool`);
  }
});

// ---- operator command --------------------------------------
test("IDB-13. infra:db-health exists, is read-only, and reports the cache verdict", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["infra:db-health"], "node scripts/infraDbHealth.mjs");
  const s = code("scripts/infraDbHealth.mjs");
  assert.doesNotMatch(s, /\.(insert|update|upsert|delete)\(/); // read-only
  assert.match(s, /cacheable/i);
  assert.match(s, /OVER_2MB_NOT_CACHEABLE|CACHEABLE_WITH_HEADROOM/);
});
