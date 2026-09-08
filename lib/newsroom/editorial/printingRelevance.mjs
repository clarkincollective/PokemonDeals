// Phase SOCIAL-CREATIVE-4A - PRINTING_COMPARISON_RELEVANCE_CHECK (§4, §37).
//
// EXACT_PRINTING_MATTERS only earns a post when the PAIR teaches a real
// printing / variant lesson. "One expensive Umbreon vs another expensive
// Umbreon from a different era" teaches nothing - it is a price-gap, not a
// printing lesson - and must be REJECTED.
//
// MEANINGFUL when the two cards are the SAME card and differ by a genuine
// printing/variant axis:
//   * same artwork, different print run (1st Edition vs Unlimited,
//     Shadowless vs Unlimited, Base Set vs Base Set 2 / Legendary
//     Collection reprint of the same number)
//   * holo vs non-holo of the same card
//   * reverse holo vs regular
//   * stamped (Prerelease / Staff / League) vs unstamped
//   * promo print vs set print of the SAME artwork
//   * same card, materially different rarity/variant treatment
//
// REJECT when: different base card, different artwork, unrelated era with
// no shared number / no variant-axis delta / no reprint lineage, or the
// only difference is price.
//
// Deterministic. Operates on catalogue-row fields only (name, set,
// card_number, rarity) - NO image analysis, NO network, NO OpenAI.

import { extractSpecies } from "../../pokemonSpecies.js";

// ---- normalisation -------------------------------------------------
const VARIANT_MARKERS = [
  ["first_edition", /\b(1st|first)\s*ed(ition)?\b/i],
  ["shadowless", /\bshadowless\b/i],
  ["unlimited", /\bunlimited\b/i],
  ["reverse_holo", /\breverse\s*holo(foil)?\b/i],
  ["holo", /\b(holo(foil)?|holographic)\b/i],
  ["non_holo", /\bnon[-\s]?holo\b/i],
  ["cosmos_holo", /\bcosmos\s*holo\b/i],
  ["pokeball_holo", /\bpok[eé]\s*ball\s*(holo|pattern)\b/i],
  ["masterball_holo", /\bmaster\s*ball\s*(holo|pattern)\b/i],
  ["promo", /\b(promo|black\s*star\s*promo|swsh\d*\b|sm\d+\b|xy\d+\b|hgss\d+\b)\b/i],
  ["staff", /\bstaff\b/i],
  ["prerelease", /\bpre[-\s]?release\b/i],
  ["league", /\b(league|championship)\b/i],
  ["stamped", /\bstamp(ed)?\b/i],
  ["gold_star", /\bgold\s*star\b/i],
  ["crystal", /\bcrystal\b/i],
  ["theme_deck", /\btheme\s*deck\b/i],
  ["first_partner", /\bfirst\s*partner\b/i],
];

// A curated set of reprint-lineage set pairs where the SAME collector
// number is genuinely the same artwork re-run. Positive signal ONLY -
// never the sole gate, never used to REJECT.
const REPRINT_LINEAGE = [
  ["base set", "base set 2"],
  ["base set", "legendary collection"],
  ["base set 2", "legendary collection"],
  ["jungle", "legendary collection"],
  ["fossil", "legendary collection"],
  ["base set", "base"],
  ["neo genesis", "legendary collection"],
  ["team rocket", "legendary collection"],
  ["celebrations", "celebrations classic collection"],
];

// Sets that are, by construction, reprints of an earlier card's artwork.
const REPRINT_PRODUCT = /\b(legendary collection|celebrations|classic collection|call of legends|expedition|crown zenith|hidden fates shiny vault|shining fates shiny vault|25th anniversary)\b/i;

const PROMO_SET = /\b(promo|black star promo|prerelease|league|staff|players cup|pokemon center)\b/i;

// vintage vs modern era, from the set name. Used only to detect
// "unrelated era" - and only when NO stronger same-artwork signal exists.
const VINTAGE_SET = /\b(base set|base set 2|jungle|fossil|team rocket|gym heroes|gym challenge|neo (genesis|discovery|revelation|destiny)|legendary collection|expedition|aquapolis|skyridge|ex (ruby|sandstorm|dragon|team|hidden|fire|deoxys|emerald|unseen|delta|crystal|holon|power|legend maker)|diamond|pearl|platinum|hgss|heartgold|call of legends)\b/i;

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Strip variant markers, set-in-name parentheticals and trailing
// qualifiers to get the bare card identity ("charizard ex", "umbreon").
export function baseCardName(name) {
  let s = String(name || "");
  s = s.replace(/\([^)]*\)/g, " "); // "(1st Edition)", "(Alt Art)"
  for (const [, re] of VARIANT_MARKERS) s = s.replace(re, " ");
  s = s.replace(/#\s*\d+[a-z]?/gi, " ").replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g, " ");
  return norm(s);
}

function normNumber(cardNumber) {
  const s = String(cardNumber || "").trim();
  if (!s) return null;
  const m = s.match(/(\d{1,3})/); // first numeric run, set-prefix + suffix stripped
  return m ? String(Number(m[1])) : null;
}

function markersOf(card) {
  const hay = `${card.name || ""} ${card.set || ""} ${card.rarity || ""}`;
  const found = new Set();
  for (const [key, re] of VARIANT_MARKERS) if (re.test(hay)) found.add(key);
  return found;
}

function lineagePair(sa, sb) {
  const a = norm(sa);
  const b = norm(sb);
  return REPRINT_LINEAGE.some(([x, y]) => (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x)));
}

// The genuine printing/variant axes we recognise, most-specific first.
const AXES = [
  { id: "first_edition_vs_unlimited", need: [["first_edition"], ["unlimited"]], lesson: "1st Edition vs Unlimited print run of the same card" },
  { id: "shadowless_vs_unlimited", need: [["shadowless"], ["unlimited", "first_edition"]], lesson: "Shadowless vs later print of the same card" },
  { id: "reverse_vs_regular", need: [["reverse_holo"], []], lesson: "Reverse holo vs regular of the same card" },
  { id: "holo_vs_non_holo", need: [["holo"], ["non_holo"]], lesson: "Holo vs non-holo of the same card" },
  { id: "stamped_vs_unstamped", need: [["stamped", "prerelease", "staff", "league"], []], lesson: "Stamped (Prerelease / Staff / League) vs standard copy" },
  { id: "gold_star", need: [["gold_star"], []], lesson: "Gold Star variant vs standard printing" },
  { id: "special_holo_pattern", need: [["cosmos_holo", "pokeball_holo", "masterball_holo"], []], lesson: "Special holo pattern vs standard holo of the same card" },
];

function axisDelta(ma, mb) {
  for (const axis of AXES) {
    const [aNeed, bNeed] = axis.need;
    const aHas = aNeed.some((k) => ma.has(k));
    const bHas = bNeed.length === 0 ? !aNeed.some((k) => mb.has(k)) : bNeed.some((k) => mb.has(k));
    const bHasA = aNeed.some((k) => mb.has(k));
    const aHasB = bNeed.length === 0 ? !aNeed.some((k) => ma.has(k)) : bNeed.some((k) => ma.has(k));
    if ((aHas && bHas && !bHasA) || (bHasA && aHasB && !aHas)) return axis;
  }
  return null;
}

/**
 * a, b: { name, set, card_number, rarity, market_price?, image_url? }
 * Returns:
 *   { ok, verdict: "MEANINGFUL" | "REJECT", reason, axis, lesson, signals }
 */
export function printingComparisonRelevance(a, b) {
  const A = { name: a?.name ?? a?.card_name, set: a?.set ?? a?.card_set, card_number: a?.card_number ?? a?.number, rarity: a?.rarity };
  const B = { name: b?.name ?? b?.card_name, set: b?.set ?? b?.card_set, card_number: b?.card_number ?? b?.number, rarity: b?.rarity };

  const baseA = baseCardName(A.name);
  const baseB = baseCardName(B.name);
  const speciesA = String(extractSpecies(A.name || "") || "").toLowerCase();
  const speciesB = String(extractSpecies(B.name || "") || "").toLowerCase();
  const numA = normNumber(A.card_number);
  const numB = normNumber(B.card_number);
  const setA = norm(A.set);
  const setB = norm(B.set);
  const ma = markersOf(A);
  const mb = markersOf(B);

  const sameNumber = Boolean(numA && numB && numA === numB);
  const sameSet = Boolean(setA && setB && setA === setB);
  const lineage = lineagePair(A.set, B.set);
  const reprintProduct = REPRINT_PRODUCT.test(A.set || "") || REPRINT_PRODUCT.test(B.set || "");
  const promoVsSet = (PROMO_SET.test(A.set || "") && !PROMO_SET.test(B.set || "")) || (PROMO_SET.test(B.set || "") && !PROMO_SET.test(A.set || ""));
  const eraA = VINTAGE_SET.test(A.set || "") ? "vintage" : "modern";
  const eraB = VINTAGE_SET.test(B.set || "") ? "vintage" : "modern";
  const axis = axisDelta(ma, mb);

  const signals = {
    same_base_name: baseA === baseB && baseA !== "",
    same_species: speciesA && speciesB ? speciesA === speciesB : null,
    same_number: sameNumber,
    same_set: sameSet,
    reprint_lineage: lineage,
    reprint_product: reprintProduct,
    promo_vs_set: promoVsSet,
    era_a: eraA,
    era_b: eraB,
    variant_axis: axis?.id ?? null,
    markers_a: [...ma],
    markers_b: [...mb],
  };

  const reject = (reason) => ({ ok: false, verdict: "REJECT", reason, axis: null, lesson: null, signals });
  const accept = (lesson, axisId, reason) => ({ ok: true, verdict: "MEANINGFUL", reason, axis: axisId, lesson, signals });

  // 1. must be the SAME card
  if (!signals.same_base_name) {
    // allow the species check to give a clearer message
    if (signals.same_species) return reject("same Pokemon but a different card (different base name / artwork) - a price gap, not a printing lesson");
    return reject("different cards entirely - not a printing comparison");
  }

  // 2. same set + same number + no axis -> it's the same listing twice
  if (sameSet && sameNumber && !axis) {
    return reject("same printing on both sides - nothing to compare");
  }

  // 3. a genuine variant/printing axis is present -> MEANINGFUL, but only
  //    when the two rows are plausibly the SAME underlying card.
  if (axis) {
    // a "loose" axis (special treatment vs the plain card: stamped,
    // reverse holo, gold star, special holo pattern) is applied to ONE
    // specific printing - so the collector number (or the set) must match,
    // otherwise it is simply a different card of the same Pokemon.
    const looseAxis = axis.need[1].length === 0;
    if (looseAxis) {
      if (sameNumber || sameSet) return accept(axis.lesson, axis.id, `variant axis ${axis.id} on the same card (number/set match)`);
      return reject(`a ${axis.id} treatment exists on one side but the two rows have different collector numbers and sets - a different card, not one card finished two ways`);
    }
    // a "named-state" axis (1st Ed vs Unlimited, shadowless, holo vs
    // non-holo): both sides are print states of one card - a shared
    // number, set, or a curated reprint lineage is enough.
    if (sameNumber || sameSet || lineage) return accept(axis.lesson, axis.id, `printing-state axis ${axis.id} on the same card`);
    return reject(`a ${axis.id} difference exists but the two cards are from unrelated sets with different numbers - likely different artwork, not one card in two printings`);
  }

  // 4. no explicit axis - accept ONLY on a strong same-artwork signal:
  //    a CURATED reprint lineage between the two sets. Same-number-across-
  //    arbitrary-sets is NOT a signal (collector numbers are per-set and
  //    collide by chance - e.g. a #12 black-star promo vs a #12 set card).
  //    Promo<->set pairings are NOT accepted here: a promo is usually its
  //    own artwork, not "the promo print of" a specific set card, and we
  //    cannot verify same-artwork from catalogue fields alone. Withhold
  //    rather than emit a weak pair (§37).
  if (lineage && (sameNumber || reprintProduct)) {
    return accept("Same card re-run in a later set within a known reprint lineage - the printing (and its value) differs", "lineage_reprint", "curated reprint lineage between the two sets");
  }

  // 5. everything else: same name, different sets, different numbers, no
  //    axis, no lineage -> unrelated-era price gap. REJECT (the Umbreon case).
  if (eraA !== eraB) {
    return reject("same name but different eras, different numbers, no shared printing axis - an era/price gap, not a printing lesson");
  }
  return reject("same card name but no meaningful printing/variant difference to teach - would just be a price comparison");
}

// Adapter for lib/social/newsroom/marketData.resolvePrintingPair row shape
// ({ name, set, card_number, rarity, market_price, image_url }).
export function printingPairRelevanceFromRows(high, low) {
  return printingComparisonRelevance(
    { name: high?.name, set: high?.set, card_number: high?.card_number, rarity: high?.rarity, market_price: high?.market_price, image_url: high?.image_url },
    { name: low?.name, set: low?.set, card_number: low?.card_number, rarity: low?.rarity, market_price: low?.market_price, image_url: low?.image_url }
  );
}

export const PRINTING_RELEVANCE_VERSION = "4a.1";
