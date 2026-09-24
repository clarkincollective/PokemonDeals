// AUDIT 2026-09-23, FINDING 7 — the homepage hero's savings chip must say
// the same thing about the same listing as the page it links to.
//
// Behavioural, against the REAL shared helpers (lib/dealQuality
// listingPresentation, lib/offerPresentation offerShipping). Nothing here
// re-implements a gate or invents arithmetic; the chip builder is compiled
// out of the shipped component and exercised on rows shaped like the live
// ones. No network call, no database read, no affiliate URL requested.
//
// MEASURED BEFORE THE FIX (scripts/integrity/auditHeroClaims.mjs,
// read-only, live rows 2026-09-24): of 308 displayable rows the hero would
// have chipped, 229 carried a claim the destination contradicts —
// 126 before-shipping with the qualifier dropped, 80 auctions shown as
// settled savings, 23 with no trustworthy reference at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import swc from "next/dist/build/swc/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const SRC = read("components/HomeHeroArt.js");
// The component's CODE, with //-comments stripped, so an assertion about
// what the hero RENDERS is never satisfied or broken by prose explaining
// what it deliberately does not render. Split on /\r?\n/, never "\n":
// this repo checks out CRLF on Windows.
const CODE = SRC.split(/\r?\n/)
  .map((line) => line.replace(/\/\/.*$/, ""))
  .join("\n");

// Compile the shipped component and pull out its chip builder, with the
// REAL helper modules wired in - not stubs. What this test exercises is
// exactly what production runs.
function loadHeroArt() {
  const { code } = swc.transformSync(SRC, {
    filename: "HomeHeroArt.js",
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  const captured = {};
  const dependency = (name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "next/link") return { __esModule: true, default: () => null };
    if (name === "@/components/DealImage") return { __esModule: true, default: () => null };
    if (name === "@/lib/listingImage") return { dealImageProps: (d) => ({ src: d.image_url ?? null, cardTcgplayerId: null }) };
    if (name === "@/lib/cardName") return require(join(ROOT, "lib/cardName.js"));
    if (name === "@/lib/publicText") return require(join(ROOT, "lib/publicText.js"));
    if (name === "@/lib/dealQuality") return require(join(ROOT, "lib/dealQuality.js"));
    if (name === "@/lib/offerPresentation") return require(join(ROOT, "lib/offerPresentation.js"));
    throw new Error("unexpected dependency " + name);
  };
  const mod = { exports: {} };
  // heroSavingsChip is module-private, so it is reached by evaluating the
  // compiled module with a tail export appended - the function under test
  // is still the shipped one, byte for byte.
  new Function("require", "module", "exports", `${code}\nmodule.exports.__chip = heroSavingsChip;`)(dependency, mod, mod.exports);
  captured.chip = mod.exports.__chip;
  return captured;
}

const { chip } = loadHeroArt();

// A row shaped like a live one. Defaults are the SUPPORTED case: a
// fixed-price listing, shipping known, a real reference below which it
// sits. Each test varies one thing.
const row = (over = {}) => ({
  id: 1,
  listing_type: "FIXED_PRICE",
  title: "Charizard Base Set",
  price: 50,
  shipping: 5, // > 0 -> shippingState "confirmed" -> savingClaim "delivered"
  total_price: 55,
  total_price_usd: 55,
  market_price: 100,
  discount_pct: 0.45,
  currency: "USD",
  is_active: true,
  is_graded: false,
  condition: "Near Mint",
  // storedReferenceEvidence requires the reference to be FOR this product,
  // at this condition and printing - anything less is not a trusted claim.
  card_tcgplayer_id: "12345",
  reference_product_id: "12345",
  reference_amount: 100,
  reference_currency: "USD",
  reference_condition: "Near Mint",
  reference_printing: "Holofoil",
  reference_observed_at: new Date().toISOString(),
  ...over,
});

// === 1. the supported case still makes its claim =======================

test("HC-1. delivered comparison: the chip states the percentage", () => {
  const r = row();
  const out = chip(r);
  assert.ok(out, "a trusted, delivered, fixed-price saving still earns a chip");
  assert.match(out, /^\d+% off$/, `expected a bare percentage, got "${out}"`);
  assert.doesNotMatch(out, /before shipping/);
});

// === 2. before-shipping: the qualifier is ON the chip ==================

test("HC-2. before-shipping comparison: the qualifier is beside the claim, not dropped", () => {
  // shipping unknown -> offerShipping returns savingClaim "before_shipping"
  const r = row({ shipping: 0, total_price: 50, total_price_usd: 50 });
  const { offerShipping } = require(join(ROOT, "lib/offerPresentation.js"));
  assert.equal(offerShipping(r).savingClaim, "before_shipping", "fixture must exercise the real before-shipping branch");

  const out = chip(r);
  assert.ok(out, "a before-shipping saving is still a saving; it just has to be qualified");
  assert.match(out, /before shipping/, `the qualifier must be on the chip, got "${out}"`);
  // and it comes from the shared helper, not a literal typed here
  assert.equal(out, `${(r.discount_pct * 100).toFixed(0)}% off${offerShipping(r).savingQualifier}`);
});

test("HC-3. the qualifier can wrap rather than be truncated away", () => {
  // A chip that could not fit its qualifier would be worse than no chip.
  assert.doesNotMatch(CODE, /whitespace-nowrap/, "the chip must be allowed to wrap");
  assert.match(CODE, /inset-x-1/, "…spanning the card, so it wraps to as few lines as it can");
  assert.match(CODE, /leading-tight/, "…and stay legible on two lines");
  assert.doesNotMatch(CODE, /truncate|text-ellipsis|line-clamp/, "no truncation of a qualification");
});

// === 3. auction: never a settled saving ================================

test("HC-4. an auction gets no percentage chip", () => {
  const r = row({ listing_type: "AUCTION", bid_count: 3 });
  assert.equal(chip(r), null, "a current bid can rise; the hero must not call it a settled saving");
  // the same row still qualifies as a saving on the deal page, where
  // there is room to say so properly - so this is a hero-space decision,
  // not a new eligibility rule
  const { listingPresentation } = require(join(ROOT, "lib/dealQuality.js"));
  assert.equal(listingPresentation(r).savings, "trusted", "the underlying row is unchanged");
});

test("HC-5. no auction row of any shape earns a chip", () => {
  // Behavioural rather than a source scan: the component legitimately
  // NAMES the auction case in order to refuse it.
  for (const over of [
    { listing_type: "AUCTION", bid_count: 0 },
    { listing_type: "AUCTION", bid_count: 12 },
    { listing_type: "AUCTION", shipping: 0, total_price: 50, total_price_usd: 50 },
    { listing_type: "AUCTION", auction_end_at: new Date(Date.now() + 36e5).toISOString() },
  ]) {
    assert.equal(chip(row(over)), null, JSON.stringify(over));
  }
  // and the hero renders no bid wording of its own
  assert.doesNotMatch(CODE, /current bid|bids can rise/i);
});

// === 4. unsupported comparison: no percentage at all ===================

test("HC-6. no trustworthy reference: no chip", () => {
  const r = row({ market_price: null, discount_pct: null, reference_amount: null, reference_product_id: null });
  assert.equal(chip(r), null);
});

test("HC-7. a positive discount_pct alone is not enough", () => {
  // The exact defect: the old chip was `Number(d.discount_pct) > 0`. A row
  // can carry a discount_pct the presentation rules refuse to stand behind.
  const r = row({ discount_pct: 0.62, reference_product_id: null, reference_amount: null, market_price: null });
  const { listingPresentation } = require(join(ROOT, "lib/dealQuality.js"));
  assert.notEqual(listingPresentation(r).savings, "trusted", "fixture must be an untrusted row");
  assert.equal(chip(r), null, "the hero must not announce a percentage its destination refuses");
});

test("HC-8. no shipping basis recorded: no chip", () => {
  const { offerShipping } = require(join(ROOT, "lib/offerPresentation.js"));
  const r = row({ shipping: null });
  if (offerShipping(r).savingClaim === "none") assert.equal(chip(r), null);
});

test("HC-9. a zero or negative discount never produces a chip", () => {
  assert.equal(chip(row({ discount_pct: 0 })), null);
  assert.equal(chip(row({ discount_pct: -0.2 })), null);
  assert.equal(chip(row({ discount_pct: null })), null);
});

// === 5. it asks the shared rules; it does not re-implement them ========

test("HC-10. the hero runs the shared gates, with no arithmetic of its own", () => {
  assert.match(SRC, /listingPresentation\(deal\)\.savings !== "trusted"/);
  assert.match(SRC, /offerShipping\(deal\)/);
  assert.match(SRC, /savingsPercentText\(deal\.discount_pct\)/);
  // the old private gate is gone
  assert.doesNotMatch(CODE, /Number\(d\.discount_pct\) > 0 \? savingsPercentText/);
  // and no independent maths
  assert.doesNotMatch(CODE, /market_price|total_price|\* 100|Math\.round\(.*discount/);
});

test("HC-11. destinations, attribution and marketplace behaviour are untouched", () => {
  assert.match(SRC, /href=\{`\/deals\/\$\{d\.id\}`\}/, "each card still links to its own deal page");
  assert.doesNotMatch(CODE, /customid|campid|subId1|wrapEbayAffiliateUrl|ebay\.com/, "the hero builds no affiliate URL");
});

// === 6. the overflow fix ==============================================

test("HC-12. the fan can shrink to its column and cannot extend the page", () => {
  // Measured before the fix at real layout viewports: 98px of horizontal
  // overflow at 1024, 55px at 1280, 21px at 1363, 11px at 1384, none at
  // 1440 and none below lg. Two causes, both in this component.
  assert.doesNotMatch(CODE, /shrink-0/, "fixed-width cards kept the row wider than its column");
  assert.match(SRC, /max-w-\[9\.5rem\] flex-1/, "cards size down instead");
  assert.match(CODE, /flex min-w-0 items-center/, "…and the row is allowed to shrink");
  assert.match(CODE, /overflow-hidden py-6 lg:block/, "rotated corners and the chip cannot extend the page");
});

test("HC-13. the fix stays inside this component", () => {
  // No breakpoint, grid, typography, nav, branding or CTA change elsewhere.
  const page = read("app/page.js");
  assert.match(page, /<HomeHeroArt deals=\{flagshipDeals\} \/>/, "the hero is still rendered the same way");
});

// === 7. methodology copy matches the bases actually supported =========

test("HC-14. methodology describes all three comparison bases, not just delivered", () => {
  const m = read("app/methodology/page.js");
  assert.match(m, /item price plus shipping/, "the delivered case is still described");
  assert.match(m, /wherever eBay gives us a shipping cost/, "…and is no longer stated unconditionally");
  assert.match(m, /before shipping/, "the before-shipping case is described");
  assert.match(m, /no saving claim/, "the no-basis case is described");
  assert.match(m, /current bid that can still rise/, "auctions are described");
});

test("HC-15. no pricing check was weakened to make the copy true", () => {
  // The copy changed; the gates did not. These are the predicates the
  // methodology page now describes, and they are the shipped ones.
  const { offerShipping } = require(join(ROOT, "lib/offerPresentation.js"));
  assert.equal(offerShipping(row()).savingClaim, "delivered");
  assert.equal(offerShipping(row({ shipping: 0, total_price: 50, total_price_usd: 50 })).savingClaim, "before_shipping");
  assert.equal(offerShipping(row()).savingQualifier, "");
  assert.equal(offerShipping(row({ shipping: 0, total_price: 50, total_price_usd: 50 })).savingQualifier, " before shipping");
});
