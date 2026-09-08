// Phase SOCIAL-CREATIVE-3B - SECONDARY DETERMINISTIC SUPPORT (SS17).
//
// deal_hero and bid_vs_total are the two families this phase is hardening
// for autonomous use. Layer-5 (the GPT-4o reviewer) is a gate, not the
// design target, and it flips PASS<->WATCH at the margin. These pure
// checks enforce the parts of the creative contract that are objectively
// decidable from the resolved facts + a small layout descriptor, so a
// borderline reviewer verdict is caught by something deterministic first.
//
// They do NOT lower any threshold - they add a hard floor. A story that
// fails a P0 here is WITHHELD (never rendered with a broken price/arith
// story); a P1 fail is WATCH.
//
// Pure. No I/O.

import { RECOGNIZABLE_SPECIES } from "../planner/scoring.mjs";
import { extractSpecies } from "../../pokemonSpecies.js";

// SS8 - deal_hero should only be AUTONOMOUSLY rendered when the deal has
// real commercial pull: an iconic species, or a card whose market
// reference is high enough that the saving is genuinely notable. A 45%
// saving on an obscure $22 card is factually fine but is not a
// scroll-stopping deal-drop; the autonomous picker withholds it (a human
// may still choose to post it). Returns a reason string, or null to run.
const DEAL_HERO_MIN_NOTABLE_MARKET = 80;
export function dealHeroWithholdReason(meta = {}) {
  const price = Number(meta.price_usd);
  const market = Number(meta.market_usd);
  const saved = Number(meta.saved_pct);
  if (!(price > 0) || !(market > price + 1)) return "no real listed-vs-market gap";
  if (!(saved >= 10)) return `saving only ${Number.isFinite(saved) ? saved : "?"}%`;
  // always re-derive the base species from the name (a raw `species` field
  // may actually be a full card name like "Charizard EX")
  const sp = String(extractSpecies(meta.species || meta.card_name || "") ?? "").toLowerCase();
  const iconic = sp && RECOGNIZABLE_SPECIES.has(sp);
  const notableValue = market >= DEAL_HERO_MIN_NOTABLE_MARKET;
  if (!iconic && !notableValue) return `low commercial pull (species "${sp || "?"}" not iconic, market ${usdish(market)} < $${DEAL_HERO_MIN_NOTABLE_MARKET})`;
  return null;
}
const usdish = (n) => `$${Math.round(Number(n) || 0)}`;

const clampGrade = (checks) => {
  const p0 = checks.some((c) => !c.ok && c.severity === "P0");
  const p1 = checks.some((c) => !c.ok && c.severity === "P1");
  return p0 ? "FAIL" : p1 ? "WATCH" : "PASS";
};

// meta: {
//   price_usd, market_usd, saved_pct,   // resolved facts
//   hero_fraction,                       // biggest visual element / canvas (0..1)
//   market_ref_font_ratio,               // market-ref px / deal-price px
//   savings_statement_count,             // how many times the % appears as a callout
//   has_countdown,                       // fake-urgency element present?
// }
export function dealHeroChecks(meta = {}) {
  const c = [];
  const add = (id, ok, severity, note) => c.push({ id, ok, severity, note });
  const price = Number(meta.price_usd);
  const market = Number(meta.market_usd);
  const saved = Number(meta.saved_pct);

  add("prices_present", price > 0 && market > 0, "P0", "listed price and market reference must both be real positive numbers");
  add("real_saving", market > price && market - price >= 1, "P0", "market reference must exceed the listed price (a real gap)");
  add(
    "saving_math_consistent",
    Number.isFinite(saved) && Math.abs(saved - Math.round((1 - price / market) * 100)) <= 1,
    "P0",
    "the rendered % must equal 1 - price/market"
  );
  add("saving_meaningful", saved >= 10, "P1", `saving is only ${Number.isFinite(saved) ? saved : "?"}% (want >=10% for a deal-drop post)`);
  add("single_savings_statement", Number(meta.savings_statement_count ?? 1) === 1, "P1", "the % below market must appear exactly once as a callout (no duplicated price facts)");
  add("market_ref_legible", Number(meta.market_ref_font_ratio ?? 0) >= 0.32, "P1", "the market reference must be large enough to read at a glance, not a tiny strike-through footnote");
  add("hero_occupancy", Number(meta.hero_fraction ?? 0) >= 0.4, "P1", `hero card is ${(Number(meta.hero_fraction ?? 0) * 100).toFixed(0)}% of the composition (want ~40-60%)`);
  add("no_fake_urgency", meta.has_countdown !== true, "P1", "no countdown / fake-urgency element on a deal-drop still");

  return { grade: clampGrade(c), checks: c, failed: c.filter((x) => !x.ok).map((x) => x.id) };
}

// meta: {
//   bid_usd, shipping_usd, landed_usd, market_ref_usd,
//   hero_fraction,
//   landed_font_ratio,   // landed-total px / bid px
//   currency,            // must be a single currency across the three values
// }
export function bidVsTotalChecks(meta = {}) {
  const c = [];
  const add = (id, ok, severity, note) => c.push({ id, ok, severity, note });
  const bid = Number(meta.bid_usd);
  const ship = Number(meta.shipping_usd);
  const landed = Number(meta.landed_usd);

  add("all_three_present", bid > 0 && ship > 0 && landed > 0, "P0", "current bid, shipping and landed total must all be real positive numbers");
  add(
    "sum_consistent",
    landed > 0 && Math.abs(bid + ship - landed) <= Math.max(0.02, 0.012 * landed),
    "P0",
    `bid ${bid} + shipping ${ship} must equal landed ${landed} within rounding (single currency)`
  );
  add("single_currency", typeof meta.currency === "string" && meta.currency.length > 0, "P0", "the three values must be shown in one stated currency");
  add("bid_not_trivial", bid >= 2, "P1", `current bid is only ${bid} - a just-opened auction teaches nothing`);
  add(
    "shipping_material",
    ship >= 3 || (bid > 0 && ship / bid >= 0.03),
    "P1",
    `shipping ${ship} is negligible vs bid ${bid} - the "shipping changes the price" lesson needs a real delta`
  );
  add("landed_dominant", Number(meta.landed_font_ratio ?? 0) >= 1.8, "P1", "the landed total must be the single largest number on the canvas");
  add("hero_occupancy", Number(meta.hero_fraction ?? 0) >= 0.38, "P1", `hero card is ${(Number(meta.hero_fraction ?? 0) * 100).toFixed(0)}% of the composition`);

  return { grade: clampGrade(c), checks: c, failed: c.filter((x) => !x.ok).map((x) => x.id) };
}

// One entry point the qaStack / NEWSROOM-3 renderer calls for a
// card-forward family that has an SS17 deterministic contract. Families
// without one return PASS (n/a).
export function cardFamilyChecks(family, facts = {}) {
  if (family === "deal_hero") return dealHeroChecks({ ...DEAL_HERO_LAYOUT, ...facts });
  if (family === "bid_vs_total") return bidVsTotalChecks({ ...BID_VS_TOTAL_LAYOUT, ...facts });
  return { grade: "PASS", checks: [], failed: [] };
}

// Layout descriptors for the current templates (single source of truth so
// the checks and the tests agree with cardEditorialTemplates.mjs).
export const DEAL_HERO_LAYOUT = Object.freeze({
  // ig_45: deal price 148px, market ref 64px -> ratio 0.432
  market_ref_font_ratio: 64 / 148,
  savings_statement_count: 1,
  has_countdown: false,
  hero_fraction: 0.44, // 820px card in a 1198px usable-height frame
});
export const BID_VS_TOTAL_LAYOUT = Object.freeze({
  // ig_45: landed 128px, bid 56px -> ratio 2.29
  landed_font_ratio: 128 / 56,
  hero_fraction: 0.4, // 680px card
});
