// Phase 1 - public trust / methodology accuracy.
//
// The /methodology, /about and /how-it-works pages must describe the
// CURRENT system: catalogue-backed pages, identity matching, image-based
// authenticity screening, the freshness lifecycle - without claiming
// every card is authenticated, without claiming every row is exact-item
// verified, and without publishing internal thresholds. The shared
// "How we check listings" block on card/deal pages must be system-level
// and link to /methodology. None of this may touch eligibility logic.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get, parseHtml, sitemapUrls, sample, pathOf } from "./lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ACCENTED = /pokémon/i;
const ORIGIN = "https://pokemondealfinder.com";

function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "-")
    .replace(/&ndash;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonLdTypes(parsed) {
  const types = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      const t = v["@type"];
      if (typeof t === "string") types.add(t);
      if (Array.isArray(t)) t.forEach((x) => types.add(x));
      Object.values(v).forEach(walk);
    }
  };
  for (const b of parsed.jsonLd) {
    assert.ok(b.ok, `invalid JSON-LD: ${b.error}`);
    walk(b.data);
  }
  return types;
}

let methodology = "";
let about = "";
let howItWorks = "";
let cardPath = null;
let dealPath = null;
let catalogCardPath = null;

before(async () => {
  methodology = (await get("/methodology")).body;
  about = (await get("/about")).body;
  howItWorks = (await get("/how-it-works")).body;

  const { byType } = await sitemapUrls();
  const cards = (byType.get("cards") ?? []).map(pathOf);
  // a card with live listings (deal hub) vs one without (catalogue view):
  // probe a few and classify by the visible "active listing(s)" chip.
  for (const p of sample(cards, 6)) {
    const res = await get(p);
    if (res.status !== 200) continue;
    const t = text(res.body);
    if (/No live eBay deals right now/i.test(t) && !catalogCardPath) catalogCardPath = p;
    else if (/active listing/i.test(t) && !cardPath) cardPath = p;
    if (cardPath && catalogCardPath) break;
  }
  cardPath = cardPath ?? catalogCardPath ?? sample(cards, 1)[0] ?? null;

  const home = parseHtml((await get("/")).body);
  dealPath = home.internalLinks.find((l) => /^\/deals\/\d+$/.test(l)) ?? null;
  if (!dealPath) {
    const deals = (byType.get("deals") ?? []).map(pathOf);
    dealPath = sample(deals, 1)[0] ?? null;
  }
});

// --- 1: no "five active listings" Pokemon-page rule ----------------------

test("1. /methodology no longer says a Pokemon page needs five active listings", () => {
  const t = text(methodology);
  assert.ok(
    !/at least five active listings/i.test(t) && !/five active listings across/i.test(t),
    "methodology still states the stale 'five active listings' Pokemon-page rule"
  );
  // and it DOES now describe the catalogue-or-listings dual basis
  assert.match(t, /can exist from catalogue data alone/i);
});

// --- 2: no static "50,000+" catalogue claim -----------------------------

test("2. /methodology does not claim a fixed 50,000+ card catalogue", () => {
  const t = text(methodology);
  assert.ok(!/50,?000\+?\s*(cards|card)/i.test(t), "methodology still claims a '50,000+' catalogue");
  assert.ok(!/\bcatalogue of [0-9][0-9,]{3,}\b/i.test(t), "methodology hardcodes a large catalogue count in prose");
});

// --- 3: catalogue-backed pages accurately described --------------------

test("3. /methodology accurately describes catalogue-backed Pokemon and card pages", () => {
  const t = text(methodology);
  assert.match(t, /catalogue-backed pages/i);
  assert.match(t, /catalogued card is not (a )?deal|not the same thing as a deal|are not deals/i);
  assert.match(t, /individual (real )?card(s)? (have|has) a permanent page|card page exists permanently/i);
  assert.match(t, /stays available but is not indexed until a real price returns/i);
});

// --- 4: visual screening does NOT claim universal authentication -------

test("4. authenticity-screening wording does not claim every card is authenticated", () => {
  for (const [name, html] of [["methodology", methodology], ["how-it-works", howItWorks], ["about", about]]) {
    const t = text(html);
    assert.ok(!/every card is authenticat/i.test(t), `${name}: claims every card is authenticated`);
    assert.ok(!/we guarantee (cards|the card|it) (are|is) genuine/i.test(t), `${name}: guarantees genuineness`);
    assert.ok(!/all listings are (visually )?verified/i.test(t), `${name}: claims all listings verified`);
  }
  const t = text(methodology);
  assert.match(t, /selected higher-risk listings/i);
  assert.match(t, /not card authentication|not (a )?guarantee|is not grading/i);
});

// --- 5: freshness wording does NOT claim exact-item verification -------

test("5. freshness wording does not claim every listing is exact-item verified", () => {
  for (const [name, html] of [["methodology", methodology], ["how-it-works", howItWorks]]) {
    const t = text(html);
    assert.ok(
      !/every listing is (re-?)?verified every \d+ ?(minutes|min|hours)/i.test(t),
      `${name}: claims every listing verified on a fixed interval`
    );
    assert.ok(
      !/exactly verified|exact-item verified \d+ (minutes|min) ago/i.test(t),
      `${name}: conflates last-seen with exact verification`
    );
  }
  assert.match(text(methodology), /not the same as confirming the exact item on eBay/i);
});

// --- 6: no internal thresholds published ------------------------------

test("6. trust copy does not expose internal thresholds or anti-abuse detail", () => {
  const forbidden = [
    /\$100\b/, /\b40\s*%/, /\b55\s*%/, /\b70\s*%/, /\b75\s*%/,
    /\b0\.(4|55|7|75)\b/, /\b72 hours?\b/, /\b120 hours?\b/, /\b168\b/,
    /token score/i, /image hash/i, /d-?hash/i, /feedback score of at least/i,
    /reserve of \d/i, /batch size/i, /scan cap/i, /quota/i,
  ];
  for (const [name, html] of [["methodology", methodology], ["how-it-works", howItWorks], ["about", about]]) {
    const t = text(html);
    for (const re of forbidden) {
      assert.ok(!re.test(t), `${name}: exposes internal detail matching ${re}`);
    }
  }
});

// --- 7: public spelling stays "Pokemon" ------------------------------

test("7. trust pages contain no accented \"Pokemon\"", () => {
  for (const [name, html] of [["methodology", methodology], ["about", about], ["how-it-works", howItWorks]]) {
    assert.ok(!ACCENTED.test(html), `${name} HTML contains an accented "Pokémon"`);
  }
});

// --- 8: /about and /how-it-works don't contradict /methodology --------

test("8. /about and /how-it-works are consistent with /methodology", () => {
  for (const [name, html] of [["about", about], ["how-it-works", howItWorks]]) {
    const t = text(html);
    assert.ok(!/at least five active listings/i.test(t), `${name}: repeats the stale five-listings rule`);
    assert.ok(!/50,?000\+?\s*cards/i.test(t), `${name}: repeats the stale 50,000+ catalogue`);
    assert.ok(!/every card is authenticat/i.test(t), `${name}: over-claims authentication`);
    assert.ok(!/set page exists only when that set has an active deal\b/i.test(t), `${name}: stale single-deal set rule`);
    // both must point at methodology as the source of truth
    assert.match(html, /href="\/methodology"/i, `${name}: does not link to /methodology`);
  }
  // six marketplaces named consistently
  for (const html of [methodology, about, howItWorks]) {
    assert.match(text(html), /Australia, Canada, Germany/i);
  }
});

// --- 9: shared trust block links to /methodology ---------------------

test("9. the shared ListingChecks block renders on card + deal pages and links to /methodology", async () => {
  const src = readFileSync(join(REPO, "components", "ListingChecks.js"), "utf8");
  assert.match(src, /href="\/methodology"|href=\{`\/methodology`\}|"\/methodology"/);
  assert.match(src, /LISTING_CHECKS/);

  assert.ok(dealPath, "no /deals/[id] path found to sample");
  const dealHtml = (await get(dealPath)).body;
  assert.match(text(dealHtml), /How we check listings/i, `${dealPath}: trust block missing`);
  assert.match(dealHtml, /href="\/methodology"/i, `${dealPath}: trust block does not link to /methodology`);

  assert.ok(cardPath, "no /cards/[slug] path found to sample");
  const cardHtml = (await get(cardPath)).body;
  assert.match(text(cardHtml), /How we check listings/i, `${cardPath}: trust block missing`);
});

// --- 10: no fabricated Review / AggregateRating / Product schema -----

test("10. trust/editorial pages carry no Review / AggregateRating / Product / Offer / FAQPage schema", () => {
  for (const [name, html] of [
    ["methodology", methodology],
    ["about", about],
    ["how-it-works", howItWorks],
  ]) {
    const types = jsonLdTypes(parseHtml(html));
    for (const bad of ["Review", "AggregateRating", "Product", "Offer", "FAQPage"]) {
      assert.ok(!types.has(bad), `${name}: has fabricated ${bad} schema`);
    }
  }
});

// --- 11: canonicals unchanged --------------------------------------

test("11. trust-page canonicals are unchanged (bare self-URLs)", async () => {
  for (const p of ["/methodology", "/about", "/how-it-works"]) {
    const { canonicals } = parseHtml((await get(p)).body);
    assert.deepEqual(canonicals, [`${ORIGIN}${p}`], `${p}: canonical changed`);
  }
});

// --- 12: eligibility logic untouched -----------------------------

test("12. eligibility logic is untouched by this change", async () => {
  // the trust files must not import or call any eligibility predicate
  const touched = [
    join(REPO, "components", "ListingChecks.js"),
    join(REPO, "lib", "trustContent.js"),
    join(REPO, "app", "methodology", "page.js"),
    join(REPO, "app", "about", "page.js"),
    join(REPO, "app", "how-it-works", "page.js"),
  ];
  for (const f of touched) {
    const src = readFileSync(f, "utf8");
    for (const fn of ["isDisplayableDeal", "isPremiumDealEligible", "isVisualScreeningCandidate", "listingMatchesCard"]) {
      assert.ok(!src.includes(fn), `${f} references eligibility fn ${fn}`);
    }
  }
  // key thresholds/constants still hold their values
  const dq = await import("../../lib/dealQuality.js");
  assert.equal(dq.PREMIUM_HIGH_RISK_MARKET_USD, 100);
  assert.equal(dq.PREMIUM_HIGH_RISK_DISCOUNT, 0.4);
  assert.equal(typeof dq.isDisplayableDeal, "function");
  assert.equal(typeof dq.isPremiumDealEligible, "function");
  const idx = await import("../../lib/indexability.js");
  assert.equal(idx.SPECIES_MIN_LISTINGS, 5);
  assert.equal(idx.CARD_HUB_MIN_LISTINGS, 2);
  assert.equal(idx.SET_MIN_LISTINGS, 3);
  const sh = await import("../../lib/speciesHub.js");
  assert.equal(sh.SPECIES_CATALOG_MIN_CARDS, 8);
  const dm = await import("../../lib/dealMatching.js");
  assert.equal(dm.MIN_SELLER_FEEDBACK_PCT, 95);
  assert.equal(dm.MIN_SELLER_FEEDBACK_SCORE, 10);
});
