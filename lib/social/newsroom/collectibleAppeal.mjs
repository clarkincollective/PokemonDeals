// Phase SOCIAL-CREATIVE-3 - COLLECTIBLE_APPEAL gate (SS17).
//
// Deterministic. A card-specific market / deal / education story must PASS
// this before it can be hosted or queued. It answers, from the resolved
// facts + the rendered composition meta (NOT pixels): is this hobby-
// native, card-specific, data-rich, and legible at thumbnail size - or is
// it a generic empty typographic infographic?
//
// Pure. No I/O.

import { RECOGNIZABLE_SPECIES } from "../planner/scoring.mjs";
import { extractSpecies } from "../../pokemonSpecies.js";

// which content families REQUIRE real card art + real data points.
export const CARD_SPECIFIC_FAMILIES = Object.freeze(["deal_hero", "bid_vs_total", "asking_vs_sold", "printing_compare", "three_up", "movers_countdown"]);
export const DATA_FAMILIES = Object.freeze([...CARD_SPECIFIC_FAMILIES, "market_shape"]);

// meta: {
//   layout_family, card_ids_shown:[...], card_art_ready_ids:[...],
//   numeric_callouts:[...],           // real numbers actually rendered
//   has_price_contrast: bool,         // two comparable prices / a %
//   hero_fraction: 0..1,              // biggest visual element / canvas
//   recognizable_subject: bool | undefined,
//   species: string | null,
//   is_generic_typographic: bool,     // no image element at all
// }
export function collectibleAppeal(meta = {}) {
  const lf = meta.layout_family;
  const checks = [];
  const add = (id, ok, sev, note) => checks.push({ id, ok, severity: sev, note });

  const cardSpecific = CARD_SPECIFIC_FAMILIES.includes(lf);
  const dataFamily = DATA_FAMILIES.includes(lf);

  // --- real card art on a card-specific family ---
  if (cardSpecific) {
    const want = new Set((meta.card_ids_shown ?? []).map(String));
    const have = new Set((meta.card_art_ready_ids ?? []).map(String));
    const missing = [...want].filter((id) => !have.has(id));
    add("card_art_present", want.size > 0 && missing.length === 0, "P0", want.size === 0 ? "no card referenced on a card-specific layout" : missing.length ? `${missing.length} card(s) have no canonical art` : "ok");
    // the card must matter visually - not postage-stamp (SS4/SS12)
    add("hero_prominence", Number(meta.hero_fraction ?? 0) >= 0.28, "P1", `hero object is ${(Number(meta.hero_fraction ?? 0) * 100).toFixed(0)}% of the composition (need >=28%)`);
  }

  // --- generic empty typographic infographic is blocked (SS2/SS18) ---
  add("not_generic_typographic", !(meta.is_generic_typographic === true && dataFamily), "P0", "a data/card story rendered as a plain typographic infographic (no visual subject)");

  // --- real data density (SS3/SS22) ---
  const n = Array.isArray(meta.numeric_callouts) ? meta.numeric_callouts.filter((v) => v != null && String(v).trim() !== "").length : 0;
  if (dataFamily) {
    add("data_points", n >= 2, "P1", `${n} real numeric callout(s) rendered (need >=2)`);
    add("price_contrast", meta.has_price_contrast === true || lf === "market_shape", "P1", "no visible price/percentage contrast");
  }

  // --- recognizable subject (SS1) - a WATCH-only nudge, not a hard fail
  if (cardSpecific && meta.recognizable_subject !== undefined) {
    const rec = meta.recognizable_subject || RECOGNIZABLE_SPECIES.has(String(meta.species ?? extractSpecies(meta.species ?? "") ?? "").toLowerCase());
    add("recognizable_subject", rec, "P2", "featured card is not a widely-recognised species");
  }

  const p0 = checks.some((c) => !c.ok && c.severity === "P0");
  const p1 = checks.some((c) => !c.ok && c.severity === "P1");
  const p2 = checks.some((c) => !c.ok && c.severity === "P2");
  const grade = p0 ? "FAIL" : p1 || p2 ? "WATCH" : "PASS";
  return { grade, checks, failed: checks.filter((c) => !c.ok).map((c) => c.id) };
}
