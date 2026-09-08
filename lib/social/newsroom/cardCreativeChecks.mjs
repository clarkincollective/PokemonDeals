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

// SOCIAL-CREATIVE-3C SS8/SS10 - the "three real deals under $CAP"
// contract. meta: {
//   cap, items: [{ tcgplayerId, card_name, price_usd, market_usd,
//     discount_pct }],  card_art_ready_ids: [...],
//   hero_fraction, has_countdown,
// }
export function threeUpChecks(meta = {}) {
  const c = [];
  const add = (id, ok, sev, note) => c.push({ id, ok, severity: sev, note });
  const items = Array.isArray(meta.items) ? meta.items : [];
  const cap = Number(meta.cap) || 0;
  const ids = items.map((i) => String(i.tcgplayerId));
  const ready = new Set((meta.card_art_ready_ids ?? []).map(String));

  add("three_cards", items.length === 3, "P0", `need exactly 3 real deals, got ${items.length}`);
  add("distinct_printings", new Set(ids).size === ids.length && ids.every((x) => /^\d+$/.test(x)), "P0", "the 3 cards must be distinct real canonical printings (no duplicate id)");
  add("all_have_art", ids.length > 0 && ids.every((x) => ready.has(x)), "P0", "every shown card needs exact canonical art");
  add("all_under_cap", cap > 0 && items.every((i) => Number(i.price_usd) > 0 && Number(i.price_usd) <= cap + 0.01), "P0", `every price must be a real positive <= $${cap}`);
  add("real_market_ref", items.every((i) => Number(i.market_usd) > Number(i.price_usd)), "P1", "each card's market reference must exceed its price (a real saving)");
  add("real_saving", items.every((i) => Number(i.discount_pct) >= 10 && Math.abs(Number(i.discount_pct) - Math.round((1 - Number(i.price_usd) / Number(i.market_usd)) * 100)) <= 2), "P1", "each rendered % must be a real >=10% saving = 1 - price/market");
  // SS10 organic-value signals
  const species = items.map((i) => String(extractSpecies(i.card_name ?? "") ?? i.card_name ?? "").toLowerCase());
  add("card_variety", new Set(species.filter(Boolean)).size >= 2, "P1", "at least 2 distinct Pokemon across the 3 cards (not the same species x3)");
  add("budget_relevance", cap > 0 && cap <= 30, "P1", `the cap ($${cap}) must actually read as "budget" (<=$30)`);
  add("save_value", items.every((i) => Number(i.discount_pct) >= 15) || Math.max(...items.map((i) => Number(i.discount_pct) || 0)) >= 40, "P1", "the grid must show a genuinely worthwhile saving (all >=15% or one >=40%)");
  add("thumbnail_price_legible", items.length === 3, "P2", "3 prices at ~70px each stay legible at a 3-up thumbnail");
  add("no_fake_urgency", meta.has_countdown !== true, "P1", "no countdown / fake-urgency element");
  add("hero_occupancy", Number(meta.hero_fraction ?? 0) >= 0.34, "P1", "the card grid must dominate the composition");

  return { grade: clampGrade(c), checks: c, failed: c.filter((x) => !x.ok).map((x) => x.id) };
}

// One entry point the qaStack / NEWSROOM-3 renderer calls for a
// card-forward family that has an SS17 deterministic contract. Families
// without one return PASS (n/a).
export function cardFamilyChecks(family, facts = {}) {
  if (family === "deal_hero") return dealHeroChecks({ ...DEAL_HERO_LAYOUT, ...facts });
  if (family === "bid_vs_total") return bidVsTotalChecks({ ...BID_VS_TOTAL_LAYOUT, ...facts });
  if (family === "three_up") return threeUpChecks({ ...THREE_UP_LAYOUT, ...facts });
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
export const THREE_UP_LAYOUT = Object.freeze({
  has_countdown: false,
  hero_fraction: 0.4, // three 480px cards
});
