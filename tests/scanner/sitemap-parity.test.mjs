// The deals sitemap segment must list ONLY deal URLs whose /deals/[id]
// page actually renders as an indexable document. The page evaluates the
// shared display gate (isDisplayableDeal) against the FULL row (select
// "*"); lib/sitemap.js evaluates the SAME gate but against a hand-picked
// column subset. If that subset omits any column isDisplayableDeal reads,
// a row that is noindex on its own page can still enter the sitemap.
//
// Regression: the subset once omitted visual_authenticity_status /
// visual_authenticity_reason (and the trust-signal columns), so a
// COUNTERFEIT_MISMATCH / IDENTITY_MISMATCH active deal - e.g. deal 24195,
// a manually-flagged gold-metal novelty - was listed in the deals
// sitemap while /deals/24195 served robots: noindex,follow and no
// Product/Offer schema. These tests pin the column parity by property,
// not by ID.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isDisplayableDeal } from "../../lib/dealQuality.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOUR = 3_600_000;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();

// --- the exact column list lib/sitemap.js selects for the deals table ---

const SITEMAP_SRC = readFileSync(join(HERE, "..", "..", "lib", "sitemap.js"), "utf8");
const COLS_BLOCK = SITEMAP_SRC.match(/const cols = sealed[\s\S]*?;/)?.[0] ?? "";
// first quoted literal = the sealed_deals list; the rest (concatenated
// with +) = the deals list.
const QUOTED = [...COLS_BLOCK.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
const DEALS_COLS = QUOTED.slice(1)
  .join(",")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Project a full row down to only what the sitemap query would return -
// exactly what isDisplayableDeal sees inside lib/sitemap.js.
const projectToSitemapRow = (row) => {
  const out = {};
  for (const c of DEALS_COLS) out[c] = row[c];
  return out;
};

// A fully-populated, otherwise-clean displayable deal row (same shape as
// deal-freshness.test.mjs, kept independent).
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
  grade: null,
  grader: null,
  ...over,
});

// Each entry: [name, overrides, expected isDisplayableDeal outcome].
// Every "false" case here depends on at least one column that the sitemap
// query must select; if the select drops it, the projected row's gate
// answer flips and the parity assertion below fails.
const CASES = [
  ["clean fixed-price deal", {}, true],
  ["clean graded slab", { is_graded: true, condition: "Ungraded", grade: "10", grader: "PSA" }, true],
  ["inactive row", { is_active: false }, false],
  ["explicit disqualified_reason", { disqualified_reason: "identity:card_mismatch" }, false],
  [
    "COUNTERFEIT_MISMATCH (deal-24195 shape)",
    {
      id: 24195,
      visual_authenticity_status: "COUNTERFEIT_MISMATCH",
      visual_authenticity_reason: "manual:gold_metal_novelty custom cards",
      disqualified_reason: null,
    },
    false,
  ],
  [
    "IDENTITY_MISMATCH",
    { visual_authenticity_status: "IDENTITY_MISMATCH", visual_authenticity_reason: "vision: wrong print" },
    false,
  ],
  [
    "UNKNOWN + vision ran + high value + extreme discount",
    {
      visual_authenticity_status: "UNKNOWN",
      visual_authenticity_reason: "vision: could not confirm",
      market_price: 400,
      discount_pct: 0.8,
    },
    false,
  ],
  ["stale (high tier, not re-seen in 80h)", { market_price: 500, last_seen_at: ago(80) }, false],
  [
    "ended auction",
    { listing_type: "AUCTION", auction_end_at: ago(1), last_seen_at: ago(0.5) },
    false,
  ],
  ["non-exact CTA destination", { affiliate_url: "https://www.ebay.com/p/24043367539", listing_url: "https://www.ebay.com/p/24043367539" }, false],
  ["wrong language in title", { title: "Charizard GX 9/68 SM Hidden Fates Japanese Holo" }, false],
  ["damaged per title", { title: "Charizard GX 9/68 SM Hidden Fates Holo Rare - water damaged" }, false],
  [
    "high-risk seller below market",
    { discount_pct: 0.78, seller_feedback_score: 10, image_count: 1, returns_accepted: false },
    false,
  ],
];

test("deals sitemap column subset preserves every isDisplayableDeal outcome (page/sitemap parity)", () => {
  for (const [name, over, expected] of CASES) {
    const full = deal(over);
    const projected = projectToSitemapRow(full);
    assert.equal(isDisplayableDeal(full), expected, `full row: ${name}`);
    assert.equal(
      isDisplayableDeal(projected),
      isDisplayableDeal(full),
      `sitemap column subset changes the gate outcome for: ${name} - a column isDisplayableDeal reads is missing from lib/sitemap.js cols`
    );
  }
});

test("a noindex deal (deal-24195 shape) cannot enter the deals sitemap - by characteristic, no ID logic", () => {
  const d = deal({
    id: 24195,
    condition: "Near Mint",
    disqualified_reason: null,
    visual_authenticity_status: "COUNTERFEIT_MISMATCH",
    visual_authenticity_reason: "manual:gold_metal_novelty",
    last_seen_at: ago(1),
  });
  // Its page is noindex, so the sitemap predicate must reject it too.
  assert.equal(isDisplayableDeal(d), false);
  assert.equal(isDisplayableDeal(projectToSitemapRow(d)), false);
  // and nothing anywhere in the sitemap module special-cases a deal id.
  assert.doesNotMatch(SITEMAP_SRC, /24195/);
  assert.doesNotMatch(SITEMAP_SRC, /\bid\s*===?\s*\d/);
  assert.doesNotMatch(SITEMAP_SRC, /\bid\s*!==?\s*\d/);
});

test("lib/sitemap.js uses the shared display gate as the deals-table page-indexable predicate", () => {
  assert.match(SITEMAP_SRC, /import \{[^}]*isDisplayableDeal[^}]*\} from "@\/lib\/dealQuality"/);
  // deals table -> isDisplayableDeal; sealed -> isDisplayableSealedDeal.
  // 17C.7 adds savingsClaimTrusted to both: a plain listing (shown, but
  // with no evidenced savings claim) renders noindex, so it must not be
  // listed in the sitemap either.
  assert.match(SITEMAP_SRC, /pageIndexable\s*=\s*sealed[\s\S]*?isDisplayableSealedDeal\(r\) && savingsClaimTrusted\(r\)/);
  assert.match(SITEMAP_SRC, /:\s*\(r\) => isDisplayableDeal\(r\) && savingsClaimTrusted\(r\)/);
  assert.match(SITEMAP_SRC, /if \(!pageIndexable\(row\)\) continue/);
});

// SEO-GSC re-audit: the served deals/sealed-deals sitemap XML was found
// carrying 48h-stale (now is_active=false -> noindex) deal URLs because
// the shared edge cache-control had stale-while-revalidate=86400. The
// churny segments must use a SHORT edge cache so a just-expired listing
// clears from the served XML in minutes, not a day+.
const ROUTE_SRC = readFileSync(join(HERE, "..", "..", "app", "sitemaps", "[segment]", "route.js"), "utf8");

test("ephemeral sitemap segments (deals/sealed-deals) get a SHORT edge cache, not the 24h SWR", () => {
  // the stable cache-control is unchanged (long SWR is fine for catalogue URLs)
  assert.match(SITEMAP_SRC, /SITEMAP_CACHE_CONTROL\s*=\s*"public, max-age=0, s-maxage=900, stale-while-revalidate=86400"/);

  // a dedicated short cache-control for the churny segments
  const eph = SITEMAP_SRC.match(/SITEMAP_CACHE_CONTROL_EPHEMERAL\s*=\s*\n?\s*"([^"]+)"/);
  assert.ok(eph, "SITEMAP_CACHE_CONTROL_EPHEMERAL is not defined");
  const val = eph[1];
  const sMax = Number((val.match(/s-maxage=(\d+)/) || [])[1]);
  const swr = Number((val.match(/stale-while-revalidate=(\d+)/) || [])[1]);
  assert.ok(sMax > 0 && sMax <= 300, `ephemeral s-maxage should be <= 300s, got ${sMax}`);
  assert.ok(swr <= 600, `ephemeral stale-while-revalidate should be <= 600s (was 86400), got ${swr}`);
  // worst-case served staleness is bounded to well under an hour
  assert.ok(sMax + swr <= 900, `ephemeral s-maxage + SWR (${sMax + swr}s) exceeds the 15-min bound`);

  // deals + sealed-deals map to the ephemeral policy; the stable ones don't
  assert.match(SITEMAP_SRC, /EPHEMERAL_SEGMENTS\s*=\s*new Set\(\["deals", "sealed-deals"\]\)/);
  assert.match(SITEMAP_SRC, /function cacheControlForSegment/);

  // the route actually uses the per-segment helper, not a hardcoded long cache
  assert.match(ROUTE_SRC, /cacheControlForSegment\(key\)/);
  assert.doesNotMatch(ROUTE_SRC, /"cache-control":\s*SITEMAP_CACHE_CONTROL\b/);
});

test("the deals sitemap select names every column isDisplayableDeal depends on", () => {
  // Columns isDisplayableDeal (lib/dealQuality) reads off a raw deals row.
  // Keep in sync with that module; the canary columns (visual
  // authenticity + trust signals) are the ones the regression dropped.
  const REQUIRED = [
    "is_active",
    "is_graded",
    "condition",
    "title",
    "card_name",
    "card_set",
    "card_language",
    "listing_id",
    "listing_url",
    "affiliate_url",
    "listing_type",
    "auction_end_at",
    "disqualified_reason",
    "visual_authenticity_status",
    "visual_authenticity_reason",
    "discount_pct",
    "market_price",
    "image_count",
    "returns_accepted",
    "seller_feedback_score",
  ];
  const missing = REQUIRED.filter((c) => !DEALS_COLS.includes(c));
  assert.deepEqual(missing, [], `deals sitemap cols missing: ${missing.join(", ")}`);
  // last_seen_at is selected too (used for <lastmod> and the freshness gate).
  assert.ok(DEALS_COLS.includes("last_seen_at"));
});
