// Phase 17C.9 - sealed product DISCRIMINATION.
//
// lib/dealMatching.listingMatchesSealedProduct asks "does the title
// contain every word of the product name (plus set evidence)?". That is
// necessary but not sufficient: a title may satisfy every word of one
// product while being a DIFFERENT product. Verified on stored rows - all
// 181 listings naming "Celebrations"/"30th" were attributed to
// sealed_watchlist #76 (2021 "Celebrations Elite Trainer Box", $361.84):
//   139  30th Anniversary Celebrations ETBs (2026, $177.39 product)
//     6  30th ETB *cases* (a case of ETBs, $1643.31 product)
//     2  30th Pokemon Center ETBs ($493.92 product)
//    29  single CARDS whose title merely names the ETB they came from
//     3  2021 Pokemon Center "case of 4 ETBs"
// Only the remainder were the watched product.
//
// This module adds the missing half: a listing must not carry evidence of
// a DIFFERENT product than the one it is being priced against. Pure, no
// I/O, relative imports only - `node --test` runs it directly.

// --- editions -------------------------------------------------------
// Anniversary/edition markers that identify WHICH release a listing is
// for. "Celebrations" appears in both the 2021 25th-anniversary set and
// the 2026 30th Celebration set, so the marker - not the shared word - is
// what tells them apart. Each entry: the marker in a title, and the
// catalogue sets it belongs to.
export const EDITION_MARKERS = Object.freeze([
  { key: "30th", title: /\b30th\b/i, sets: ["ME: 30th Celebration"] },
  { key: "25th", title: /\b25th\b/i, sets: ["Celebrations"] },
]);

// The edition a title claims, or null when it names none.
export function editionOfTitle(title) {
  const s = String(title ?? "");
  const hits = EDITION_MARKERS.filter((m) => m.title.test(s));
  if (hits.length !== 1) return null; // none, or contradictory ("25th 30th")
  return hits[0].key;
}

// The edition a catalogue set belongs to, or null.
export function editionOfSet(setName) {
  const s = String(setName ?? "");
  return EDITION_MARKERS.find((m) => m.sets.includes(s))?.key ?? null;
}

// --- product kinds ---------------------------------------------------
// Sealed products of the same set and same words differ by KIND. A case
// is not an ETB; a Pokemon Center exclusive is not the standard box; a
// single card that merely names a product is not that product.
// Order matters - the most specific kind wins.
const KIND_RULES = [
  // A SINGLE CARD that merely names the product it came from ("Greninja -
  // Gold Star (Celebrations Elite Trainer Box) Holo #SWSH144"). Markers
  // must be card-specific: a bare "123/456" collector-number pattern is
  // NOT usable here because sellers write ship dates the same way -
  // "ETB PRESALE 9/16" was read as a card by an earlier version of this
  // rule, which rejected the real ETB listings. Promo codes appear with
  // and without a "#" ("SWSH144", "PROMOS-SWSH144"), so both are matched.
  // A promo card code is THREE digits ("SWSH144", "SWSH087", "SWSH 144");
  // two digits is a SET code ("SWSH09: Brilliant Stars", "... Sealed Box
  // SWSH09 1"), which is not a card at all - an earlier version matched
  // \d{2,3} and read a Build & Battle box as a single card.
  [
    "single_card",
    /\b(?:psa|cgc|bgs)\s*\d|\bgraded\b|#?\s?swsh\s?\d{3}\b|\bgold star\b|\bblack star promos?\b|\bsingle card\b/i,
  ],
  ["case", /\bcase\b|\bsealed case\b|\bcase of\b/i],
  ["pokemon_center_etb", /\bpok[eé]mon\s*cent(?:er|re)\b[\s\S]{0,40}?(?:elite trainer box|\betb\b)|(?:elite trainer box|\betb\b)[\s\S]{0,40}?\bpok[eé]mon\s*cent(?:er|re)\b/i],
  ["etb", /\belite trainer box\b|\betb\b/i],
  ["booster_box", /\bbooster box\b/i],
  ["booster_bundle", /\bbooster bundle\b/i],
  // Build & Battle is three SEPARATE catalogue SKUs at very different
  // prices - e.g. Perfect Order Build & Battle Box (672400, $37.62),
  // Paradox Rift Build & Battle Stadium (514070, $94.51) and Perfect
  // Order Build & Battle Box Display (690172, $315.37). Most specific
  // first: "Box Display" before "Stadium" before the plain "Box".
  ["build_battle_display", /build\s*&?\s*(?:and\s*)?battle\b[^|]{0,20}?\bdisplay\b/i],
  ["build_battle_stadium", /build\s*&?\s*(?:and\s*)?battle\b[^|]{0,20}?\bstadium\b/i],
  ["build_battle_box", /build\s*&?\s*(?:and\s*)?battle/i],
  ["tin", /\btins?\b/i],
  ["blister", /\bblister\b/i],
  ["deck", /\b(?:battle|theme|starter|league) deck\b/i],
  ["collection", /\bcollection\b|\bpremium collection\b|\bbox\b/i],
];

// An "acrylic case"/"display case" is packaging FOR a product, not a
// case OF products - it must not be read as the case SKU.
const PROTECTIVE_CASE = /\b(?:acrylic|display|protector|protective|magnetic|storage)\s+case\b|\bcase\s+(?:protector|only)\b/i;

// A seller's multi-unit LOT ("Lot of 2", "x4", "(13) LOT", "lotto di 5")
// is not the single-unit product: four ETBs sold together must never be
// priced against one ETB's market reference. Quantity is therefore read
// BEFORE kind.
//
// A factory CASE is the exception, not a counter-example: it is itself a
// multi-unit catalogue SKU with its own price ("30th Celebration Elite
// Trainer Box Case", "Celebrations Pokemon Center ETB Case"), so a title
// reading "Case (Sealed Case of 4)" IS that product and its count is the
// product's own. sealedListingDecision admits a counted title only when
// the product AND the title are both cases - "Sealed Case of 4 ETBs"
// against a single-ETB product stays a lot.
//
// A bare year in parentheses is NOT a quantity: "Celebrations Elite
// Trainer Box (2021)" appears 7 times in the stored rows and an earlier
// `\(\s*x?\s*\d+\s*\)` read every one of them as a lot, which would have
// rejected legitimate single ETBs. A parenthesised count must carry an
// "x" ("(x4)") or a following count word ("(13) LOT").
const LOT_PATTERNS = [
  /\blot(?:to)?\s*(?:of|di)\s*\d+/i,
  /\b\d+\s*x\s*(?:booster|elite|etb|box|pack|bundle|tin)/i,
  /\(\s*x\s*\d+\s*\)/i,
  /\(\s*\d+\s*\)\s*(?:lot|pcs|pieces|packs?|boxes|bundles?)\b/i,
  /\bx\s?\d+\s*\)/i,
  /\bcase\s+of\s+\d+/i,
  /\b\d+\s+(?:pokemon|pokémon)\b[^|]{0,40}\blot\b/i,
  /\blot\b[^|]{0,20}\bof\s+\d+/i,
];
export function isMultiUnitLot(title) {
  const s = String(title ?? "");
  return LOT_PATTERNS.some((re) => re.test(s));
}

export function productKindOfTitle(title) {
  const s = String(title ?? "");
  for (const [kind, re] of KIND_RULES) {
    if (kind === "case" && PROTECTIVE_CASE.test(s)) continue;
    if (re.test(s)) return kind;
  }
  return null;
}

// The kind a catalogue product is, from its own name + product_type.
export function productKindOfProduct({ name, productType } = {}) {
  const s = `${name ?? ""} ${productType ?? ""}`;
  for (const [kind, re] of KIND_RULES) {
    if (kind === "single_card") continue; // a watched product is never a card
    if (re.test(s)) return kind;
  }
  return null;
}

// --- scoped seller-title aliases -------------------------------------
//
// The official catalogue name stays "30th Celebration" (singular) - it is
// the verified English name (17C.7) and is NOT changed. The problem is on
// the seller side: eBay titles for this 2026 release almost always write
// the set plural ("30th Anniversary Celebrations Elite Trainer Box"), and
// lib/dealMatching.listingMatchesSealedProduct matches whole tokens, so
// "Celebration" never matches "Celebrations". Measured on the stored
// corpus: 0 of 138 stored 30th listings reach product 704143 without this.
//
// This is deliberately NOT a global singular/plural rule. It is one entry,
// scoped to ONE set, and it only supplies an ALTERNATIVE name/set string to
// the existing token matcher - it changes no token logic, and the identity
// decision below still runs against the REAL product, so product kind,
// quantity/lot, Pokemon Center and the 2021 edition protections are
// completely unaffected.
//
// The alias is only offered when the TITLE carries explicit identity
// evidence for this release, so an unmarked "Celebrations Elite Trainer
// Box" is never loosened. Defence in depth: even with the alias, a title
// with no 30th marker is still rejected by rule 3 below
// (edition_unstated:30th), so a "2026"-only title cannot slip through.
export const SELLER_TITLE_ALIASES = Object.freeze([
  Object.freeze({
    set: "ME: 30th Celebration",
    aliasSet: "ME: 30th Celebrations",
    rewriteName: (name) => String(name ?? "").replace(/\bCelebration\b/gi, "Celebrations"),
    requiresEvidence: /\b30th\b|\b2026\b/i,
  }),
]);

// An alternative product identity to try when the real one fails the token
// matcher, or null when no alias is scoped to this product / the title
// lacks the required evidence.
export function aliasedProductForTitle(title, product) {
  const alias = SELLER_TITLE_ALIASES.find((a) => a.set === String(product?.set ?? ""));
  if (!alias) return null;
  if (!alias.requiresEvidence.test(String(title ?? ""))) return null;
  const name = alias.rewriteName(product?.name);
  if (name === product?.name) return null; // nothing to vary
  return { ...product, name, set: alias.aliasSet };
}

// The scanner's name-token stage, alias-aware. `matchesName` is injected so
// this stays pure and the real lib/dealMatching matcher is what runs.
// Returns { ok, viaAlias }.
export function sealedNameMatch(listing, product, matchesName) {
  if (matchesName(listing, product)) return { ok: true, viaAlias: false };
  const alias = aliasedProductForTitle(listing?.title, product);
  if (alias && matchesName(listing, alias)) return { ok: true, viaAlias: true };
  return { ok: false, viaAlias: false };
}

// --- the decision ----------------------------------------------------
// `product`: { name, set, productType }. `title`: the listing title.
// Returns { ok: true } or { ok: false, reason }. Reasons are stable
// strings so the scanner can count them and a test can assert them.
export function sealedListingDecision(title, product) {
  // 0. Quantity before kind: a multi-unit lot is not the single-unit
  //    product. The one counted title that IS its product is a factory
  //    case - a multi-unit SKU in its own right - so a count is admitted
  //    only when the product and the title are both cases.
  if (isMultiUnitLot(title)) {
    const bothCases = productKindOfProduct(product) === "case" && productKindOfTitle(title) === "case";
    if (!bothCases) return { ok: false, reason: "quantity_lot" };
  }

  const titleEdition = editionOfTitle(title);
  const productEdition = editionOfSet(product?.set);

  // 1. A 2026 product must never be priced against 2021 (or vice versa).
  if (titleEdition && productEdition && titleEdition !== productEdition) {
    return { ok: false, reason: `edition_mismatch:${titleEdition}_vs_${productEdition}` };
  }
  // 2. A listing naming an edition our product's set has no edition for
  //    (e.g. "30th" against plain "Celebrations") is a different release.
  if (titleEdition && !productEdition) {
    return { ok: false, reason: `edition_absent_from_product:${titleEdition}` };
  }
  // 3. An edition product needs its marker, or an unambiguous set name -
  //    "Celebrations Elite Trainer Box" alone is ambiguous between the two.
  if (!titleEdition && productEdition) {
    return { ok: false, reason: `edition_unstated:${productEdition}` };
  }

  const titleKind = productKindOfTitle(title);
  const productKind = productKindOfProduct(product);
  // 4. A single card that merely names a product is not that product.
  if (titleKind === "single_card") return { ok: false, reason: "kind_mismatch:single_card" };
  // 5. Different product kind (case vs ETB, Pokemon Center vs standard).
  if (titleKind && productKind && titleKind !== productKind) {
    return { ok: false, reason: `kind_mismatch:${titleKind}_vs_${productKind}` };
  }
  // 6. The kind is unreadable from the title - too ambiguous to price.
  if (!titleKind && productKind) return { ok: false, reason: "kind_unstated" };

  return { ok: true };
}

// Convenience predicate for the scanner's filter chain.
export function listingIsThisSealedProduct(title, product) {
  return sealedListingDecision(title, product).ok;
}
