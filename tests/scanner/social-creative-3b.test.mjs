// Phase SOCIAL-CREATIVE-3B - harden deal_hero + bid_vs_total for
// autonomous use. Pure-logic + source-scan. No DB, no OpenAI, no renderer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  dealHeroChecks, bidVsTotalChecks, dealHeroWithholdReason,
  DEAL_HERO_LAYOUT, BID_VS_TOTAL_LAYOUT,
} from "../../lib/social/newsroom/cardCreativeChecks.mjs";
import { renderCardEditorialHtml } from "../../lib/social/newsroom/cardEditorialTemplates.mjs";
import { CARD_LAYOUT_STATUS, cardForwardAutonomousSafe } from "../../lib/social/newsroom/cardLayoutStatus.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");

// realistic strong deal_hero facts
const DH_OK = { price_usd: 79, market_usd: 187, saved_pct: 58, ...DEAL_HERO_LAYOUT };
const BV_OK = { bid_usd: 12, shipping_usd: 18, landed_usd: 30, market_ref_usd: 45, currency: "USD", ...BID_VS_TOTAL_LAYOUT };

// ---- deal_hero deterministic contract -----------------------------
test("C3B-1. deal_hero: prices + real saving + consistent math all pass on a real strong deal", () => {
  const r = dealHeroChecks(DH_OK);
  assert.equal(r.grade, "PASS");
  assert.deepEqual(r.failed, []);
});

test("C3B-2. deal_hero: missing / non-real price data FAILS (real data required)", () => {
  assert.equal(dealHeroChecks({ ...DH_OK, price_usd: 0 }).grade, "FAIL");
  assert.equal(dealHeroChecks({ ...DH_OK, market_usd: null }).grade, "FAIL");
});

test("C3B-3. deal_hero: market <= price (no gap) FAILS", () => {
  const r = dealHeroChecks({ ...DH_OK, price_usd: 190, market_usd: 187, saved_pct: -2 });
  assert.equal(r.grade, "FAIL");
  assert.ok(r.failed.includes("real_saving"));
});

test("C3B-4. deal_hero: rendered % must equal 1 - price/market (no fabricated saving)", () => {
  const r = dealHeroChecks({ ...DH_OK, saved_pct: 90 });
  assert.equal(r.grade, "FAIL");
  assert.ok(r.failed.includes("saving_math_consistent"));
});

test("C3B-5. deal_hero: the % below market must appear exactly once (no duplicated price semantics)", () => {
  assert.ok(dealHeroChecks({ ...DH_OK, savings_statement_count: 2 }).failed.includes("single_savings_statement"));
  // the template renders it once
  const html = renderCardEditorialHtml("deal_hero", { card: { tcgplayerId: "1", name: "Charizard EX", set: "Base" }, priceUsd: 79, marketUsd: 187, discountPct: 58 });
  assert.equal((html.match(/% below market/g) || []).length, 1);
});

test("C3B-6. deal_hero: market reference must be legible (not a tiny footnote)", () => {
  assert.ok(DEAL_HERO_LAYOUT.market_ref_font_ratio >= 0.32);
  assert.ok(dealHeroChecks({ ...DH_OK, market_ref_font_ratio: 0.15 }).failed.includes("market_ref_legible"));
});

test("C3B-7. deal_hero: hero card must dominate ~40-60% of the composition", () => {
  assert.ok(DEAL_HERO_LAYOUT.hero_fraction >= 0.4 && DEAL_HERO_LAYOUT.hero_fraction <= 0.62);
  assert.ok(dealHeroChecks({ ...DH_OK, hero_fraction: 0.2 }).failed.includes("hero_occupancy"));
});

test("C3B-8. deal_hero: no fake-urgency element", () => {
  assert.equal(DEAL_HERO_LAYOUT.has_countdown, false);
  assert.ok(dealHeroChecks({ ...DH_OK, has_countdown: true }).failed.includes("no_fake_urgency"));
  // scan just the deal_hero function body (avoid matching the unrelated
  // "movers_countdown" layout identifier elsewhere in the file)
  const src = code("lib/social/newsroom/cardEditorialTemplates.mjs");
  const dh = src.slice(src.indexOf("export function dealHero"), src.indexOf("export function bidVsTotal"));
  assert.doesNotMatch(dh, /ends in|hurry|last chance|selling fast|act now/i);
});

// ---- deal_hero SS8 commercial-pull withhold gate -----------------
test("C3B-9. deal_hero withhold gate: iconic species always runs; obscure + modest value is withheld", () => {
  assert.equal(dealHeroWithholdReason({ price_usd: 14, market_usd: 28, saved_pct: 50, card_name: "Charizard EX" }), null);
  assert.equal(dealHeroWithholdReason({ price_usd: 60, market_usd: 120, saved_pct: 50, card_name: "Garchomp" }), null);
  assert.match(dealHeroWithholdReason({ price_usd: 20, market_usd: 40, saved_pct: 50, card_name: "Wobbuffet" }) || "", /low commercial pull/);
  assert.equal(dealHeroWithholdReason({ price_usd: 120, market_usd: 240, saved_pct: 50, card_name: "Wobbuffet" }), null); // notable value
  assert.match(dealHeroWithholdReason({ price_usd: 95, market_usd: 100, saved_pct: 5, card_name: "Charizard" }) || "", /saving only/);
});

// ---- bid_vs_total deterministic contract ------------------------
test("C3B-10. bid_vs_total: bid + shipping = landed within rounding (single currency)", () => {
  assert.equal(bidVsTotalChecks(BV_OK).grade, "PASS");
  assert.ok(bidVsTotalChecks({ ...BV_OK, landed_usd: 55 }).failed.includes("sum_consistent"));
  assert.ok(bidVsTotalChecks({ ...BV_OK, currency: "" }).failed.includes("single_currency"));
});

test("C3B-11. bid_vs_total: all three arithmetic values must be real positives (real data required)", () => {
  assert.equal(bidVsTotalChecks({ ...BV_OK, shipping_usd: 0 }).grade, "FAIL");
  assert.equal(bidVsTotalChecks({ ...BV_OK, bid_usd: 0, landed_usd: 18 }).grade, "FAIL");
});

test("C3B-12. bid_vs_total: landed total must be the single largest number on the canvas", () => {
  assert.ok(BID_VS_TOTAL_LAYOUT.landed_font_ratio >= 1.8);
  assert.ok(bidVsTotalChecks({ ...BV_OK, landed_font_ratio: 1.1 }).failed.includes("landed_dominant"));
});

test("C3B-13. bid_vs_total: labels are unambiguous and the equation reads exactly once", () => {
  const html = renderCardEditorialHtml("bid_vs_total", { card: { tcgplayerId: "1", name: "Raichu", set: "Gym Heroes" }, bidUsd: 12, shippingUsd: 18, landedUsd: 30, marketRefUsd: 45 });
  assert.match(html, /Current bid/);
  assert.match(html, /Shipping/);
  assert.match(html, /You pay/);
  // one "=" operator, one landed value
  assert.equal((html.match(/>=<\/span>/g) || []).length, 1);
  // the hook is non-numeric (numbers appear only in the equation)
  const hook = html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1] ?? "";
  assert.doesNotMatch(hook, /\d/);
});

test("C3B-14. bid_vs_total: trivial bid / negligible shipping are flagged (the lesson needs a real delta)", () => {
  assert.ok(bidVsTotalChecks({ ...BV_OK, bid_usd: 1, landed_usd: 19 }).failed.includes("bid_not_trivial"));
  assert.ok(bidVsTotalChecks({ bid_usd: 300, shipping_usd: 1, landed_usd: 301, currency: "USD", ...BID_VS_TOTAL_LAYOUT }).failed.includes("shipping_material"));
});

// ---- exact auction semantics (SS12) ---------------------------
test("C3B-15. bid_vs_total renders the CURRENT bid, not opening bid / market reference, and never sums a mixed currency", () => {
  const raw = read("lib/social/newsroom/marketData.mjs");
  const fn = raw.slice(raw.indexOf("export async function resolveBidVsTotalSamples"), raw.indexOf("// A real active auction: bid + shipping + landed total."));
  assert.match(fn, /marketplace["']?,\s*["']EBAY_US["']/);   // single-currency source
  assert.match(fn, /Math\.abs\(bid \+ ship - total\)/);      // sum consistency enforced at source
  assert.match(fn, /bid_usd: bid\b/);                        // current bid = deals.price
  assert.match(fn, /const bid = .*Number\(d\.price\)/);      // "price" is the current bid on an auction row
});

// ---- autonomous-safe status only after the reliability test -----
test("C3B-16. deal_hero / bid_vs_total autonomous_safe is only true when CARD_LAYOUT_STATUS says so, and matches its grade", () => {
  for (const s of ["DEAL_DROP", "AUCTION_BID_VS_TOTAL"]) {
    const row = CARD_LAYOUT_STATUS[s];
    assert.ok(row);
    if (row.autonomous_safe) assert.equal(row.grade, "VISUALLY_STRONG_NOW");
    assert.equal(cardForwardAutonomousSafe(s), Boolean(row.autonomous_safe));
  }
});

test("C3B-17. the harden harness gates autonomous-safe on >=90% Layer-5 PASS, no FAIL, no recurring det blocker", () => {
  const s = code("scripts/socialCreativeHarden.mjs");
  assert.match(s, /passRate >= 0\.9/);
  assert.match(s, /l5s\.fail === 0/);
  assert.match(s, /recurring\.length === 0/);
  assert.match(s, /reviewRenderedCreativeMulti/);
  assert.match(s, /samples: SAMPLES/);
});

// ---- SAFETY -------------------------------------------------
test("C3B-18. no Buffer write, no Stage 1, no NEWSROOM-3, no eBay Browse in this phase's code", () => {
  for (const p of ["scripts/socialCreativeHarden.mjs", "lib/social/newsroom/cardCreativeChecks.mjs", "lib/social/newsroom/cardEditorialTemplates.mjs"]) {
    const c = code(p);
    assert.doesNotMatch(c, /getSocialProvider|bufferBacklog|scheduleOne|createPost|customScheduled|saveToDraft/, `${p} Buffer write`);
    assert.doesNotMatch(c, /SOCIAL_BUFFER_BACKLOG_ENABLED|REFILL_SCHEDULE|activateRefill/, `${p} NEWSROOM-3`);
    assert.doesNotMatch(c, /ebayBrowse|\/buy\/browse|browseSearch/i, `${p} eBay Browse`);
  }
  const s = read("scripts/socialCreativeHarden.mjs");
  assert.match(s, /published: 0/);
  assert.match(s, /stage1: "OFF"/);
  assert.match(s, /newsroom3: "OFF"/);
});

test("C3B-19. RIGHTS_STATE.publishing stays DISABLED; canonical art only (no generated art)", () => {
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
  const c = code("lib/social/newsroom/cardEditorialTemplates.mjs");
  assert.doesNotMatch(c, /openai|dall-?e|images\/generations|fetch\(/i);
  assert.match(c, /cardArt\?\.\[String\(id\)\]/);
});

test("C3B-20. this phase does not touch verify-deals, the verify allocator, or the email system", () => {
  for (const p of ["scripts/socialCreativeHarden.mjs", "lib/social/newsroom/cardCreativeChecks.mjs", "lib/social/newsroom/marketData.mjs"]) {
    const c = code(p);
    assert.doesNotMatch(c, /verifyAllocator|allocateVerifyBatch|api\/verify-deals/, `${p} verify`);
    assert.doesNotMatch(c, /newsletter_subscribers|sendDigest|resendClient|RESEND_API_KEY/i, `${p} email`);
  }
});
