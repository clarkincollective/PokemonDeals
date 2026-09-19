// 2026-09-19 growth brief §6 - alert criteria on top of the 12A same-unit
// contract. Pure evaluator matrix + the route/form/migration pins.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import am from "../../lib/alertMatch.js";

const {
  normalizeAlertCriteria, offerMatchesCriteria, evaluateOfferForAlert, evaluateAlertAgainstOffers,
  listingItemUsd, usdToCurrency, shouldNotify, describeCriteria, evaluateAlert,
} = am;
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const RATES = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.52, CAD: 1.36 };
// a displayable offer with a SUPPORTED saving (the fixture shape the
// evaluator's untargeted path needs: stored reference evidence + condition)
const offer = (over = {}) => ({
  id: 1,
  marketplace: "EBAY_US",
  currency: "USD",
  title: "Charizard Base Set 4/102 Holo NM",
  price: 40,
  shipping: 5,
  total_price: 45,
  total_price_usd: 45,
  market_price: 100,
  discount_pct: 0.55,
  condition: "Near Mint",
  is_graded: false,
  listing_type: "FIXED_PRICE",
  // stored reference evidence (lib/dealQuality storedReferenceEvidence):
  // same product, same amount, same condition, the exact printing priced
  reference_source: "ppt_live",
  reference_amount: 100,
  reference_currency: "USD",
  reference_condition: "Near Mint",
  reference_product_id: "123",
  card_tcgplayer_id: "123",
  reference_printing: "Holofoil",
  first_seen_at: "2026-09-19T00:00:00Z",
  last_seen_at: "2026-09-19T09:00:00Z",
  ...over,
});

test("normalise: closed vocabularies, unknown values dropped WITH a note, grader/grade imply graded", () => {
  const n = normalizeAlertCriteria({ marketplace: "ebay_gb", condition: "nm", targetCurrency: "gbp", targetScope: "item", minDiscount: 20, digest: true });
  assert.deepEqual([n.marketplace, n.condition, n.target_currency, n.target_scope, n.min_discount, n.digest], ["EBAY_GB", "NM", "GBP", "item", 0.2, true]);
  const bad = normalizeAlertCriteria({ marketplace: "EBAY_JP", condition: "mint", targetCurrency: "JPY", targetScope: "landed", minDiscount: 15, grade: "11" });
  assert.deepEqual([bad.marketplace, bad.condition, bad.target_currency, bad.target_scope, bad.min_discount, bad.grade], [null, null, "USD", "all_in", null, null]);
  for (const code of ["marketplace_invalid", "condition_invalid", "currency_invalid", "scope_invalid", "min_discount_invalid", "grade_invalid"]) assert.ok(bad.notes.includes(code), code);
  const g = normalizeAlertCriteria({ grader: "psa", grade: "10" });
  assert.equal(g.condition, "graded");
  assert.equal(g.grader, "PSA");
  assert.equal(g.grade, "10");
  const clash = normalizeAlertCriteria({ condition: "NM", grade: 9 });
  assert.equal(clash.condition, "graded");
  assert.ok(clash.notes.includes("condition_vs_graded"));
});

test("criteria narrow WHICH offers count: marketplace, raw condition tier, graded + grader + grade", () => {
  assert.equal(offerMatchesCriteria({ marketplace: "EBAY_GB" }, offer()), false);
  assert.equal(offerMatchesCriteria({ marketplace: "EBAY_US" }, offer()), true);
  assert.equal(offerMatchesCriteria({ condition: "NM" }, offer()), true);
  assert.equal(offerMatchesCriteria({ condition: "LP" }, offer()), false);
  assert.equal(offerMatchesCriteria({ condition: "NM" }, offer({ condition: "Lightly Played" })), false);
  assert.equal(offerMatchesCriteria({ condition: "NM" }, offer({ is_graded: true, grader: "PSA", grade: 10 })), false, "a raw-condition alert never matches a graded copy");
  const psa10 = offer({ is_graded: true, grader: "PSA", grade: "10" });
  assert.equal(offerMatchesCriteria({ condition: "graded" }, psa10), true);
  assert.equal(offerMatchesCriteria({ condition: "graded", grader: "PSA", grade: "10" }, psa10), true);
  assert.equal(offerMatchesCriteria({ condition: "graded", grader: "CGC" }, psa10), false);
  assert.equal(offerMatchesCriteria({ condition: "graded", grader: "PSA", grade: "9" }, psa10), false);
  assert.equal(offerMatchesCriteria({ condition: "graded" }, offer()), false);
});

test("currency: the threshold lives in the alert's currency; the listing's USD total is converted at CHECK time; no rate -> fail closed", () => {
  const l = offer({ marketplace: "EBAY_GB", currency: "GBP", total_price: 35.55, total_price_usd: 45, price: 31.6, shipping: 3.95 });
  // £40 target vs $45 * 0.79 = £35.55 -> matched
  const r = evaluateOfferForAlert({ target_amount: 40, target_currency: "GBP", target_scope: "all_in" }, l, { rates: RATES });
  assert.equal(r.matched, true);
  assert.equal(r.comparison.unit, "GBP");
  assert.ok(Math.abs(r.comparison.listing - 35.55) < 0.01);
  // £30 target -> not matched
  assert.equal(evaluateOfferForAlert({ target_amount: 30, target_currency: "GBP" }, l, { rates: RATES }).matched, false);
  // no rate table -> never a false positive
  const noRate = evaluateOfferForAlert({ target_amount: 40, target_currency: "GBP" }, l, { rates: null });
  assert.equal(noRate.matched, false);
  assert.equal(noRate.reason, "no-rate-for-currency");
  assert.equal(usdToCurrency(10, "AUD", RATES), 15.2);
  assert.equal(usdToCurrency(10, "USD", null), 10);
  // a USD-only legacy row (target_price_usd) reads identically through both evaluators
  assert.equal(evaluateOfferForAlert({ target_price_usd: 50 }, offer(), { rates: RATES }).matched, true);
  assert.equal(evaluateAlert({ target_price_usd: 50 }, offer()).matched, true);
});

test("scope: all-in needs RECORDED shipping - unknown/unstated shipping never satisfies a total-price target; item scope compares the item share", () => {
  const known = offer({ shipping: 5, total_price: 45, total_price_usd: 45, price: 40 });
  assert.equal(evaluateOfferForAlert({ target_amount: 45, target_currency: "USD", target_scope: "all_in" }, known, { rates: RATES }).matched, true);
  const unknownShip = offer({ shipping: null, total_price: 40, total_price_usd: 40, price: 40 });
  const r = evaluateOfferForAlert({ target_amount: 45, target_currency: "USD", target_scope: "all_in" }, unknownShip, { rates: RATES });
  assert.equal(r.matched, false);
  assert.equal(r.reason, "shipping-unknown-for-all-in");
  const zeroShip = offer({ shipping: 0, total_price: 40, total_price_usd: 40, price: 40 });
  assert.equal(evaluateOfferForAlert({ target_amount: 45, target_currency: "USD", target_scope: "all_in" }, zeroShip, { rates: RATES }).matched, false, "0 may mean unstated");
  // item scope: $40 item share of a $45 total -> matches a $42 item target even though the total is $45
  const item = evaluateOfferForAlert({ target_amount: 42, target_currency: "USD", target_scope: "item" }, known, { rates: RATES });
  assert.equal(item.matched, true);
  assert.equal(item.comparison.scope, "item");
  assert.ok(Math.abs(listingItemUsd(known) - 40) < 1e-9);
  // and the item target works when shipping is unknown (it never claimed the total)
  assert.equal(evaluateOfferForAlert({ target_amount: 42, target_currency: "USD", target_scope: "item" }, unknownShip, { rates: RATES }).matched, true);
});

test("untargeted: a SUPPORTED saving at or above the alert's own floor - a positive but untrusted comparison never fires", () => {
  assert.equal(evaluateOfferForAlert({ min_discount: 0.3 }, offer({ discount_pct: 0.55 })).matched, true);
  assert.equal(evaluateOfferForAlert({ min_discount: 0.3 }, offer({ discount_pct: 0.2 })).matched, false);
  assert.equal(evaluateOfferForAlert({}, offer({ discount_pct: 0.12 })).matched, true, "default floor 10%");
  const untrusted = offer({ discount_pct: 0.55, reference_product_id: null, card_tcgplayer_id: null, reference_printing: null });
  assert.equal(evaluateOfferForAlert({ min_discount: 0.1 }, untrusted).matched, false, "no stored reference evidence -> no claim -> no alert");
});

test("against a cheapest-first list: the FIRST offer that satisfies criteria + threshold wins, a legacy row stays dormant", () => {
  const offers = [
    offer({ id: 1, marketplace: "EBAY_US", total_price_usd: 45, total_price: 45 }),
    offer({ id: 2, marketplace: "EBAY_GB", currency: "GBP", total_price: 39.5, total_price_usd: 50, price: 35, shipping: 4.5 }),
    offer({ id: 3, marketplace: "EBAY_GB", currency: "GBP", total_price: 47.4, total_price_usd: 60, price: 43, shipping: 4.4 }),
  ];
  const r = evaluateAlertAgainstOffers({ marketplace: "EBAY_GB", target_amount: 45, target_currency: "GBP" }, offers, { rates: RATES });
  assert.equal(r.matched, true);
  assert.equal(r.offer.id, 2);
  const none = evaluateAlertAgainstOffers({ marketplace: "EBAY_AU" }, offers, { rates: RATES });
  assert.equal(none.matched, false);
  assert.equal(none.offer, null);
  const legacy = evaluateAlertAgainstOffers({ target_price: 12 }, offers, { rates: RATES });
  assert.equal(legacy.legacyDormant, true);
  assert.equal(legacy.matched, false);
});

test("dedupe: never the same listing twice for one alert, never inside the cooldown", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");
  const H = 3_600_000;
  assert.equal(shouldNotify({ last_notified_deal_id: 7 }, { id: 7 }, now, 20 * H), false);
  assert.equal(shouldNotify({ last_notified_deal_id: 7, last_notified_at: new Date(now - 2 * H).toISOString() }, { id: 8 }, now, 20 * H), false);
  assert.equal(shouldNotify({ last_notified_deal_id: 7, last_notified_at: new Date(now - 21 * H).toISOString() }, { id: 8 }, now, 20 * H), true);
});

test("describeCriteria is a plain, unit-bearing summary", () => {
  assert.equal(describeCriteria({ marketplace: "EBAY_GB", condition: "NM", target_amount: 40, target_currency: "GBP", target_scope: "all_in" }), "eBay GB · Near Mint · total incl. shipping ≤ 40.00 GBP");
  assert.equal(describeCriteria({ condition: "graded", grader: "PSA", grade: "10", min_discount: 0.2 }), "PSA grade 10 · ≥ 20% below market");
  assert.equal(describeCriteria({}), "");
});

test("static: migration is additive; the route probes the schema and refuses to widen; the cron matches over displayable offers and groups digests", () => {
  const mig = read("supabase/price_alerts_criteria_migration.sql");
  assert.match(mig, /add column if not exists digest boolean not null default false/);
  assert.match(mig, /add column if not exists target_amount numeric/);
  assert.doesNotMatch(mig, /drop column|drop table|delete from|update price_alerts set/i);
  const route = read("app/api/alerts/route.js");
  assert.match(route, /select\("digest"\)\.limit\(1\)/, "probes the criteria schema");
  assert.match(route, /reason: "criteria_unavailable"/, "refuses non-default criteria until the migration is applied");
  assert.match(route, /const targetPriceUsd = targetAmount != null && criteria\.target_currency === "USD" \? targetAmount : null;/);
  assert.match(route, /cardSlug = `set:\$\{setSlug\}`/);
  const cron = read("app/api/check-alerts/route.js");
  assert.match(cron, /evaluateAlertAgainstOffers\(a, offers, \{ rates, discountFloor: DISCOUNT_FLOOR \}\)/);
  assert.match(cron, /fetchSetDealsPage\(\{ setName: resolved\.set, sort: "discount", listingType: "FIXED_PRICE"/);
  assert.match(cron, /if \(a\.digest\) \{/);
  assert.match(cron, /digestEmail\(email, items\)/);
  assert.match(cron, /getUsdRates\(\)/);
  const form = read("components/PriceAlertForm.js");
  assert.match(form, /Narrow this alert/);
  assert.match(form, /Saving a card keeps it on this device; an alert emails you/);
  assert.match(form, /EVENTS\.ALERT_CREATED/);
  assert.doesNotMatch(form, /email:\s*email[^,]*\}\)\s*;?\s*capture|capture\([^)]*email/, "the address never reaches analytics");
});

test("static: set pages mount a set alert, the card page anchors #price-alert, the expired page offers save + alert", () => {
  assert.match(read("app/sets/[slug]/page.js"), /<PriceAlertForm kind="set" setSlug=\{slug\} setName=\{resolved\.set\}/);
  assert.match(read("app/cards/[slug]/page.js"), /<div id="price-alert" className="scroll-mt-24">/);
  const dealPage = read("app/deals/[id]/page.js");
  assert.match(dealPage, /Email me when it&apos;s listed again/);
  assert.match(dealPage, /href=\{`\/cards\/\$\{cardHub\.slug\}#price-alert`\}/);
});
