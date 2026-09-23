// SEO/affiliate audit 2026-09-23, FINDING 2: card-page summaries made
// savings claims their own listing tiles could not support.
//
// The summaries above the listing grid on /cards/[slug] were handed a bare
// USD number (the cheapest offer's dealTotalUsd) and re-derived a saving
// from it against the RAW catalogue reference:
//
//     belowPct = round((1 - listing / marketValueUsd) * 100)
//
// That is a second savings rule, maintained nowhere near the first, and it
// contradicted the tile directly below. Measured against live rows on
// 2026-09-24 over 225 English card hubs: 221 summaries asserted a saving;
// 14 asserted one the cheapest listing's trust checks REFUSE, 3 compared a
// graded copy to the raw reference, 50 described an auction bid as a listing
// price, 155 dropped the " before shipping" qualifier, 63 stated a
// percentage different from the tile's.
//
// These tests exercise the REAL selection and calculation - lib/
// cardSummaryOffer over hand-built rows, and the real components compiled
// through the render harness. Every expectation is derived from the row's
// own columns by hand in the comment beside it; none is copied from what
// the implementation happened to print.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { loadRoute } from "../helpers/r3RouteHarness.mjs";
import { cardSummaryOffer } from "../../lib/cardSummaryOffer.js";
import { cardWorthAnswer } from "../../lib/cardWorth.js";

const SUMMARY_SRC = readFileSync(new URL("../../lib/cardSummaryOffer.js", import.meta.url), "utf8");
// CRLF-safe comment stripper: a `.`-based one silently no-ops on
// \r-terminated lines, which would let a commented-out reference slip past
// the "no second rule" assertions below.
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^:])\/\/.*/, "$1"))
    .join("\n");

// A provider observation time after any tracked release start; fixed, so
// the tests never read the clock.
const OBSERVED = "2026-09-15T00:00:00.000Z";
const ITM = "https://www.ebay.com/itm/123456789012";

// One plain raw listing of Clefable - Jungle (product 45120), priced at
// $26.50 + $4.25 recorded shipping = $30.75 delivered, against a $38.26
// Near Mint Holofoil reference for the SAME product id, observed by the
// provider. Jungle is outside the tracked-release list, so the extra
// release-day floor does not apply.
//
//   1 - 30.75 / 38.26 = 0.19629...  ->  20% when rounded for display
const base = () => ({
  id: 900001,
  is_active: true,
  marketplace: "EBAY_US",
  listing_type: "FIXED_PRICE",
  title: "Clefable Jungle 1/64 Holo Rare Near Mint",
  card_name: "Clefable",
  card_set: "Jungle",
  card_tcgplayer_id: "45120",
  condition: "Near Mint",
  card_language: "english",
  currency: "USD",
  price: 26.5,
  shipping: 4.25,
  total_price: 30.75,
  total_price_usd: 30.75,
  market_price: 38.26,
  discount_pct: 0.196,
  reference_source: "test_fixture",
  reference_product_id: "45120",
  reference_amount: 38.26,
  reference_currency: "USD",
  reference_condition: "Near Mint",
  reference_printing: "Holofoil",
  reference_observed_at: OBSERVED,
  affiliate_url: ITM,
  listing_url: ITM,
  first_seen_at: "2026-09-20T00:00:00.000Z",
  last_seen_at: "2026-09-24T00:00:00.000Z",
});

const PanelComponent = loadRoute("app/cards/[slug]/page.js", { renderComponents: "visual" }).components.get(
  "@/components/CardPriceIntelligence"
);
const panel = (props) => renderToStaticMarkup(createElement(PanelComponent, props));
// The panel always carries the RAW catalogue reference as its headline
// figure. 157.82 is deliberately far above every listing total below, so an
// arithmetic fallback would be unmistakable in the output.
const RAW_REFERENCE = 157.82;
const renderPanel = (summaryOffer) =>
  panel({ marketValueUsd: RAW_REFERENCE, referenceCondition: "Near Mint", trends: null, signal: null, coverage: null, summaryOffer, offersCount: 3 });

// === 1. the comparable case still produces the right positive saving =====

test("CS-1. a comparable raw listing with a recorded shipping charge keeps its saving, stated as delivered", () => {
  const s = cardSummaryOffer([base()]);
  assert.equal(s.lowUsd, 30.75);
  assert.equal(s.priceBasis, "delivered"); // shipping 4.25 > 0 was recorded
  assert.equal(s.isAuction, false);
  assert.equal(s.graded, false);
  assert.equal(s.gradeLabel, null);
  assert.equal(s.savingsReason, null);
  assert.equal(s.saving.pct, 0.196);
  assert.equal(s.saving.referenceUsd, 38.26);
  assert.equal(s.saving.qualifier, ""); // delivered needs no qualifier
  const html = renderPanel(s);
  // 1 - 30.75/38.26 = 0.1963 -> "20%", and against ITS OWN reference
  assert.match(html, /20% below/);
  assert.match(html, /its market reference/);
  assert.doesNotMatch(html, /before shipping/);
  // the raw catalogue headline is NOT what the saving was measured against:
  // 1 - 30.75/157.82 would be 81%
  assert.doesNotMatch(html, /81% below/);
});

// === 2. unsupported printing -> no discount at all ======================

test("CS-2. a reverse-holo reference on a listing that never says reverse yields NO saving", () => {
  // Same money, but the reference we hold describes a PARALLEL printing and
  // nothing in the listing's own words evidences that finish. The tile
  // refuses the claim (referenceIsUnevidencedParallelPrinting), so the
  // summary must refuse it too - not fall back to the catalogue figure.
  const s = cardSummaryOffer([{ ...base(), reference_printing: "Reverse Holofoil" }]);
  assert.equal(s.saving, null);
  assert.equal(s.savingsReason, "parallel_printing");
  assert.equal(s.lowUsd, 30.75); // the PRICE is still a fact and still travels
  const html = renderPanel(s);
  assert.doesNotMatch(html, /% below|below its market reference|cheapest active listing/);
  // and specifically not the arithmetic the panel used to do:
  // 1 - 30.75/157.82 = 81%
  assert.doesNotMatch(html, /\b81%|\b80%/);
});

test("CS-2b. the same listing DOES keep its saving once its own title evidences the finish", () => {
  // Nothing about the rule is loosened; the evidence arrives in the seller's
  // own words, which is the only thing that can supply it.
  const s = cardSummaryOffer([
    { ...base(), reference_printing: "Reverse Holofoil", title: "Clefable Jungle 1/64 Reverse Holo Near Mint" },
  ]);
  assert.equal(s.savingsReason, null);
  assert.equal(s.saving.pct, 0.196);
});

// === 3. graded is never compared to a raw reference =====================

test("CS-3. a graded listing's saving is against its own grade-specific reference, named as such", () => {
  // CGC 9 copy at $75.08 against the $187.62 CGC 9 reference stored on the
  // row. 1 - 75.08/187.62 = 0.5998 -> 60%. The panel's headline figure is
  // the RAW catalogue reference; comparing a graded copy to it is the defect.
  const graded = {
    ...base(),
    id: 900002,
    title: "Shining Legends Shining Rayquaza 56/73 Shiny Holo CGC 9",
    condition: "Graded",
    is_graded: true,
    grader: "CGC",
    grade: 9,
    price: 75.08,
    shipping: 3.5,
    total_price: 78.58,
    total_price_usd: 78.58,
    market_price: 187.62,
    discount_pct: 0.5811,
    reference_condition: null,
    reference_printing: null,
    reference_grader: "CGC",
    reference_grade: "9",
    reference_amount: 187.62,
  };
  const s = cardSummaryOffer([graded]);
  assert.equal(s.graded, true);
  assert.equal(s.gradeLabel, "CGC 9");
  assert.equal(s.saving.referenceUsd, 187.62); // the GRADED figure, not 157.82
  const html = renderPanel(s);
  assert.match(html, /\), a CGC 9 graded copy, is/);
  assert.match(html, /its CGC 9 market reference/);
  // 1 - 78.58/187.62 = 0.581 -> 58%; the raw comparison would be 50%
  assert.match(html, /58% below/);
  assert.doesNotMatch(html, /50% below/);
});

test("CS-3b. a graded listing whose stored reference is for a DIFFERENT grade claims nothing", () => {
  const s = cardSummaryOffer([
    { ...base(), is_graded: true, grader: "PSA", grade: 10, condition: "Graded", reference_grader: "PSA", reference_grade: "9", reference_condition: null, reference_printing: null },
  ]);
  assert.equal(s.saving, null);
  assert.equal(s.savingsReason, "no_reference");
});

// === 4. shipping and auction qualifiers survive ========================

test("CS-4. shipping unconfirmed keeps the saving but carries 'before shipping' into the summary", () => {
  // shipping = 0 means free OR unstated; the stored total is the item price
  // only, so the saving is a before-shipping saving (lib/offerPresentation).
  const s = cardSummaryOffer([{ ...base(), shipping: 0, total_price: 26.5, total_price_usd: 26.5 }]);
  assert.equal(s.priceBasis, "before_shipping");
  assert.equal(s.saving.qualifier, " before shipping");
  const html = renderPanel(s);
  assert.match(html, /before shipping/);
});

test("CS-4b. an unrecorded shipping breakdown yields NO saving from that total", () => {
  const s = cardSummaryOffer([{ ...base(), shipping: null }]);
  assert.equal(s.priceBasis, "none");
  assert.equal(s.saving, null);
  assert.equal(s.savingsReason, "shipping_not_recorded");
  assert.doesNotMatch(renderPanel(s), /% below/);
});

test("CS-4c. an auction's figure is stated as a current bid, never as a listing price", () => {
  const s = cardSummaryOffer([{ ...base(), listing_type: "AUCTION", auction_end_time: "2027-01-01T00:00:00.000Z" }]);
  assert.equal(s.isAuction, true);
  const html = renderPanel(s);
  assert.match(html, /is an auction; its current bid/);
  assert.doesNotMatch(html, /The cheapest active listing \(/);
});

// === 5. missing evidence never becomes zero or a fallback ==============

test("CS-5. no stored reference evidence -> no claim, no zero, no catalogue fallback", () => {
  const bare = { ...base() };
  for (const k of Object.keys(bare)) if (k.startsWith("reference_")) delete bare[k];
  const s = cardSummaryOffer([bare]);
  assert.equal(s.saving, null);
  assert.equal(s.savingsReason, "no_reference");
  const html = renderPanel(s);
  assert.doesNotMatch(html, /% below/);
  assert.doesNotMatch(html, /0%|−0%/);
  // the panel still does its real job - it just makes no savings claim
  assert.match(html, /Price intelligence/);
});

test("CS-5b. a listing at or above its reference claims nothing (never '0% below')", () => {
  const s = cardSummaryOffer([{ ...base(), market_price: 30, reference_amount: 30, discount_pct: -0.025 }]);
  assert.equal(s.saving, null);
  assert.equal(s.savingsReason, "not_below_reference");
  assert.doesNotMatch(renderPanel(s), /% below/);
});

test("CS-5c. no live offer at all -> no descriptor, and the panel renders without one", () => {
  assert.equal(cardSummaryOffer([]), null);
  assert.equal(cardSummaryOffer(null), null);
  const html = renderPanel(null);
  assert.doesNotMatch(html, /% below|cheapest active listing/);
  assert.match(html, /Price intelligence/);
});

// === 6. the subject is offers[0] - the summary never shops for a claim ==

test("CS-6. when the cheapest listing may not claim, the summary does not promote a dearer one that can", () => {
  // "The cheapest active listing" must describe the cheapest listing. A
  // summary that skipped to offers[1] would state a true percentage about
  // the wrong subject.
  const refused = { ...base(), id: 900010, reference_printing: "Reverse Holofoil" };
  const claimable = { ...base(), id: 900011, price: 31, total_price: 35.25, total_price_usd: 35.25, discount_pct: 0.079 };
  const s = cardSummaryOffer([refused, claimable]);
  assert.equal(s.dealId, 900010);
  assert.equal(s.saving, null);
  assert.doesNotMatch(renderPanel(s), /% below/);
});

// === 7. the worth answer states the floor's basis ======================

test("CS-7. the worth answer's 'from $X' carries its shipping basis and auction status", () => {
  const worth = (over) => {
    const s = cardSummaryOffer([{ ...base(), ...over }]);
    return cardWorthAnswer({
      name: "Clefable",
      set: "Jungle",
      cardNumber: "1/64",
      marketUsd: RAW_REFERENCE,
      priceSource: "catalog",
      liveListings: { count: 3, lowUsd: s.lowUsd, lowBasis: s.priceBasis, lowIsAuction: s.isAuction },
    }).live;
  };
  assert.equal(worth({}).lowShippingText, "including shipping");
  assert.equal(worth({}).lowKindText, "asking prices, not sold");
  assert.equal(worth({ shipping: 0, total_price: 26.5, total_price_usd: 26.5 }).lowShippingText, "before shipping");
  assert.equal(worth({ shipping: null }).lowShippingText, "with no shipping breakdown recorded");
  assert.equal(worth({ listing_type: "AUCTION" }).lowKindText, "a current auction bid, not a sold price");
  // a card with no live-deal hub still gets no live block at all
  assert.equal(cardWorthAnswer({ name: "Clefable", set: "Jungle", marketUsd: 10, liveListings: null }).live, null);
});

// === 8. no second eligibility rule may grow back =======================

test("CS-8. the summary rule delegates to the established gates and adds no condition of its own", () => {
  const code = stripComments(SUMMARY_SRC);
  // it asks the gates by name
  assert.match(code, /require\("\.\/dealQuality\.js"\)/);
  assert.match(code, /require\("\.\/offerPresentation\.js"\)/);
  assert.match(code, /require\("\.\/money\.js"\)/);
  assert.match(code, /pres\.savings === "trusted" && ship\.savingClaim !== "none"/);
  // and it must not re-implement any of them
  assert.doesNotMatch(code, /reference_printing|reference_condition|reference_grade|reference_observed_at|reference_amount/);
  assert.doesNotMatch(code, /DEAL_DISCOUNT_THRESHOLD|savingsClaimTrusted|isDisplayableDeal|hasPositiveComparison/);
  // no arithmetic against a market value anywhere in this module
  assert.doesNotMatch(code, /marketValueUsd|1\s*-\s*\w+\s*\/\s*\w+/);
});
