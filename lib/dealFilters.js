// Phase 13B.3 - the one place the Pokemon-page scoped-deal filter
// contract is defined. Pure, deterministic, unit-tested (see
// tests/scanner/deal-filters.test.mjs). Both the data layer
// (fetchSpeciesDealsPage) and the API route (/api/deals-page) build their
// query from planDealFilters(), so "no modifier is ever silently ignored"
// is provable: every recognised input dimension ends up either in the
// query plan (eq / lte / gte) or in `notes` with an explicit reason.
//
// Design decisions (documented per the 13B.3 brief):
//
//  * grader + grade are DEPENDENT on graded. A grader or a grade always
//    implies type=graded. A contradictory pair (type=raw + grader/grade)
//    is normalised to the *cleanest truthful state* by KEEPING the more
//    specific grader/grade and flipping type to graded - never by
//    silently dropping the grader or the grade - and a note records it so
//    the UI can say so.
//
//  * price filtering compares against total_price_usd (the canonical USD
//    column established in Phase 12A), never the marketplace-native
//    total_price, so "under $200" means the same thing on every eBay
//    site.
//
//  * listing accepts the brief's contract value BIN as well as the raw
//    column value FIXED_PRICE (older FilterBar links emit FIXED_PRICE);
//    both mean the same fixed-price listing.

// Real graders present in / supported by the deals pipeline
// (lib/ebay.js GRADER_NAME_PATTERNS). PSA/CGC/BGS/SGC are the recognised
// slab graders; ACE/TAG are accepted when hand-typed but not surfaced as
// primary filter chips.
export const SUPPORTED_GRADERS = Object.freeze(["PSA", "CGC", "BGS", "SGC", "ACE", "TAG"]);

// The grader chips the Pokemon-page filter UI actually offers.
export const GRADER_CHOICES = Object.freeze(["PSA", "CGC", "BGS", "SGC"]);

// Valid third-party grade values (1..10, half grades from 5.5 up - the
// range real slabs actually use; matches lib/searchIntent.js grade
// parsing and lib/dealMatching.js GRADE_VALUE).
export const GRADE_VALUES = Object.freeze([
  "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "5.5",
  "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10",
]);

// The grade chips the Pokemon-page filter UI offers (the grades collectors
// actually shop by).
export const GRADE_CHOICES = Object.freeze(["10", "9.5", "9", "8", "7"]);

export const TYPE_VALUES = Object.freeze(["all", "raw", "graded"]);
export const LISTING_VALUES = Object.freeze(["all", "BIN", "AUCTION"]);

function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// A strictly-positive finite number, else null. Rejects "-5", "0", "abc",
// "" and NaN.
function posNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// raw: whatever arrived on the query string (all strings / undefined):
//   { type, grader, grade, listing, minPrice, maxPrice }
// Returns the normalised, non-contradictory filter state plus `notes`:
//   [{ code, message }]  - human-readable, safe to show in the UI.
export function normalizeDealFilters(raw = {}) {
  const notes = [];

  // --- type (all | raw | graded) ---------------------------------------
  let type = cleanStr(raw.type);
  if (type) type = type.toLowerCase();
  if (type && !TYPE_VALUES.includes(type)) {
    notes.push({ code: "type_invalid", message: `Ignored unknown card type "${raw.type}".` });
    type = null;
  }
  if (!type) type = "all";

  // --- grader --------------------------------------------------------
  let grader = cleanStr(raw.grader);
  if (grader) grader = grader.toUpperCase();
  if (grader && !SUPPORTED_GRADERS.includes(grader)) {
    notes.push({ code: "grader_invalid", message: `Ignored unknown grader "${raw.grader}".` });
    grader = null;
  }

  // --- grade ------------------------------------------------------
  let grade = cleanStr(raw.grade);
  if (grade != null) {
    // tolerate "10.0" -> "10"
    const asNum = Number(grade);
    if (Number.isFinite(asNum) && Number.isInteger(asNum)) grade = String(asNum);
    if (!GRADE_VALUES.includes(grade)) {
      notes.push({ code: "grade_invalid", message: `Ignored unsupported grade "${raw.grade}".` });
      grade = null;
    }
  }

  // --- dependency: grader / grade imply graded ------------------------
  if (grader || grade != null) {
    if (type === "raw") {
      // contradictory - keep the MORE SPECIFIC grader/grade, flip to
      // graded. Never silently drop the grader/grade.
      notes.push({
        code: "raw_vs_graded",
        message:
          grader && grade != null
            ? `"${grader} ${grade}" is a graded-card filter — showing graded results.`
            : grader
              ? `${grader} is a graded-card filter — showing graded results.`
              : `Grade ${grade} is a graded-card filter — showing graded results.`,
      });
    }
    type = "graded";
  }

  // --- listing (all | BIN | AUCTION), FIXED_PRICE accepted as BIN ---
  let listing = cleanStr(raw.listing);
  if (listing) {
    const up = listing.toUpperCase();
    if (up === "FIXED_PRICE" || up === "BIN") listing = "BIN";
    else if (up === "AUCTION") listing = "AUCTION";
    else if (up === "ALL") listing = "all";
    else {
      notes.push({ code: "listing_invalid", message: `Ignored unknown listing type "${raw.listing}".` });
      listing = null;
    }
  }
  if (!listing) listing = "all";

  // --- price (canonical USD) ---------------------------------------
  let maxPrice = posNum(raw.maxPrice);
  let minPrice = posNum(raw.minPrice);
  if (raw.maxPrice != null && raw.maxPrice !== "" && maxPrice == null) {
    notes.push({ code: "maxprice_invalid", message: `Ignored invalid maximum price "${raw.maxPrice}".` });
  }
  if (raw.minPrice != null && raw.minPrice !== "" && minPrice == null) {
    notes.push({ code: "minprice_invalid", message: `Ignored invalid minimum price "${raw.minPrice}".` });
  }
  if (maxPrice != null && minPrice != null && minPrice > maxPrice) {
    notes.push({
      code: "price_range_inverted",
      message: `Minimum $${minPrice} is above maximum $${maxPrice} — dropped the minimum.`,
    });
    minPrice = null;
  }

  return { type, grader, grade, listing, minPrice, maxPrice, notes };
}

// The concrete Supabase filter plan for a normalised state. Keys are real
// `deals` columns. The data layer / route apply these generically, so the
// set of filters can't drift from this contract.
export function planDealFilters(raw = {}) {
  const norm = normalizeDealFilters(raw);
  const eq = {};
  const lte = {};
  const gte = {};

  if (norm.type === "raw") eq.is_graded = false;
  if (norm.type === "graded") eq.is_graded = true;
  if (norm.grader) eq.grader = norm.grader;
  if (norm.grade != null) eq.grade = String(norm.grade);
  if (norm.listing === "BIN") eq.listing_type = "FIXED_PRICE";
  if (norm.listing === "AUCTION") eq.listing_type = "AUCTION";
  if (norm.maxPrice != null) lte.total_price_usd = norm.maxPrice;
  if (norm.minPrice != null) gte.total_price_usd = norm.minPrice;

  return { ...norm, eq, lte, gte };
}

// Is this a non-default filter state (i.e. the page must fetch a filtered
// slice rather than serve the server-rendered page-1)? `country` and
// `sort` are handled separately by the grid, matching the pre-13B.3
// behaviour.
export function hasActiveDealFilters(raw = {}) {
  const n = normalizeDealFilters(raw);
  return (
    n.type !== "all" ||
    n.grader != null ||
    n.grade != null ||
    n.listing !== "all" ||
    n.minPrice != null ||
    n.maxPrice != null
  );
}

// Short chip labels for the applied-filter row (section 8). Order is
// stable and reads left-to-right the way a collector would say it.
export function appliedFilterChips(raw = {}) {
  const n = normalizeDealFilters(raw);
  const chips = [];
  if (n.type === "graded") chips.push({ key: "type", label: "Graded", clears: ["type", "grader", "grade"] });
  if (n.type === "raw") chips.push({ key: "type", label: "Raw", clears: ["type"] });
  if (n.grader) chips.push({ key: "grader", label: n.grader, clears: ["grader"] });
  if (n.grade != null) chips.push({ key: "grade", label: `Grade ${n.grade}`, clears: ["grade"] });
  if (n.minPrice != null && n.maxPrice != null)
    chips.push({ key: "price", label: `$${n.minPrice}–$${n.maxPrice}`, clears: ["minPrice", "maxPrice"] });
  else if (n.maxPrice != null)
    chips.push({ key: "maxPrice", label: `Under $${n.maxPrice}`, clears: ["maxPrice"] });
  else if (n.minPrice != null)
    chips.push({ key: "minPrice", label: `Over $${n.minPrice}`, clears: ["minPrice"] });
  if (n.listing === "BIN") chips.push({ key: "listing", label: "Buy It Now", clears: ["listing"] });
  if (n.listing === "AUCTION") chips.push({ key: "listing", label: "Auction", clears: ["listing"] });
  return chips;
}

// Ordered relaxation actions for an empty filtered result (section 9).
// Each returns the list of param keys to DROP - the caller turns that
// into a real href. Never broadens automatically; the collector clicks.
export function relaxationSteps(raw = {}) {
  const n = normalizeDealFilters(raw);
  const steps = [];
  if (n.maxPrice != null || n.minPrice != null)
    steps.push({ label: "Remove the price limit", drop: ["minPrice", "maxPrice"] });
  if (n.grade != null && n.grader)
    steps.push({ label: `Any ${n.grader} grade`, drop: ["grade"] });
  else if (n.grade != null) steps.push({ label: "Any grade", drop: ["grade"] });
  if (n.grader) steps.push({ label: "All graded (any grader)", drop: ["grader", "grade"] });
  if (n.listing !== "all") steps.push({ label: "Buy It Now and auctions", drop: ["listing"] });
  if (n.type === "graded" && !n.grader && n.grade == null)
    steps.push({ label: "Raw and graded", drop: ["type"] });
  // always last: clear everything
  steps.push({
    label: "Clear all filters",
    drop: ["type", "grader", "grade", "listing", "minPrice", "maxPrice"],
  });
  return steps;
}
