// Phase 13B.4.1 - the /search structured-facet contract.
//
// The search box identifies the SUBJECT (parseSearchIntent from the query
// text). Structured URL filters REFINE that subject. This module overlays
// the explicit URL filter state onto a text-parsed SearchIntent to produce
// one effective intent, reusing the Phase 13B.3 deal-filter contract
// (normalizeDealFilters) so grader/grade dependency + validation behave
// identically to the Pokemon pages.
//
// Precedence (documented per the 13B.4.1 brief §3):
//   * A filter key PRESENT in the URL (even empty) is the user's explicit
//     current UI state and WINS over the same modifier parsed from the
//     query text, per key.
//   * A filter key ABSENT from the URL defers to whatever the text parsed
//     ("psa 10 pikachu" still means grader=PSA, grade=10 with a bare
//     ?q=).
//   * After the per-key overlay, normalizeDealFilters() applies the
//     grader/grade -> graded dependency and drops invalid values with a
//     note - same as everywhere else.
//
// Relative imports so `node --test` can load this directly.
import { normalizeDealFilters, hasActiveDealFilters } from "./dealFilters.js";

// The deal-refinement facets carried on the /search URL. `country` and
// `sort` predate this phase and are handled by the route directly.
export const SEARCH_FILTER_KEYS = Object.freeze([
  "type",
  "grader",
  "grade",
  "minPrice",
  "maxPrice",
  "listing",
]);

// Pull the sparse structured-filter state off a URLSearchParams (or a
// plain {k:v} object). A key is included when it is PRESENT - an empty
// value ("") is kept and means "explicitly cleared in the UI".
export function readSearchFilters(searchParams) {
  const has = (k) =>
    typeof searchParams?.has === "function"
      ? searchParams.has(k)
      : Object.prototype.hasOwnProperty.call(searchParams ?? {}, k);
  const get = (k) =>
    typeof searchParams?.get === "function" ? searchParams.get(k) : (searchParams ?? {})[k];

  const out = {};
  for (const k of SEARCH_FILTER_KEYS) {
    if (has(k)) out[k] = get(k) ?? "";
  }
  return out;
}

// intent: a SearchIntent from parseSearchIntent(). urlFilters: sparse
// object from readSearchFilters(). Returns:
//   { intent, notes, activeFilters, filtersFromUrl, hasActiveFilters }
//     intent          - a NEW SearchIntent with format / grader / grade /
//                       listing_type / price_min / price_max reconciled
//     notes           - [{code,message}] from normalizeDealFilters (e.g.
//                       "type=raw + PSA -> showing graded results")
//     activeFilters    - normalized {type,grader,grade,listing,minPrice,
//                       maxPrice} - the canonical current filter state
//     filtersFromUrl   - which keys were actually sourced from the URL
export function mergeIntentWithFilters(intent, urlFilters = {}) {
  // what the query text alone implied, in dealFilters vocabulary
  const textState = {
    type: intent.format === "graded" ? "graded" : intent.format === "raw" ? "raw" : null,
    grader: intent.grader ?? null,
    grade: intent.grade ?? null,
    listing:
      intent.listing_type === "BIN" ? "BIN" : intent.listing_type === "AUCTION" ? "AUCTION" : null,
    minPrice: intent.price_min ?? null,
    maxPrice: intent.price_max ?? null,
  };

  const filtersFromUrl = [];
  const merged = { ...textState };
  for (const k of SEARCH_FILTER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(urlFilters, k)) continue;
    const v = urlFilters[k];
    if (v == null || v === "" || (typeof v === "string" && v.toLowerCase() === "all")) {
      // present-but-empty / "all" == explicit clear of that key
      merged[k] = null;
    } else {
      merged[k] = v;
      filtersFromUrl.push(k);
    }
  }

  const n = normalizeDealFilters(merged);

  const next = {
    ...intent,
    subject: { ...intent.subject },
    ambiguities: Array.isArray(intent.ambiguities) ? [...intent.ambiguities] : [],
  };
  next.format = n.type === "graded" ? "graded" : n.type === "raw" ? "raw" : "any";
  next.grader = n.grader;
  next.grade = n.grade;
  next.listing_type = n.listing === "BIN" ? "BIN" : n.listing === "AUCTION" ? "AUCTION" : "any";
  next.price_min = n.minPrice;
  next.price_max = n.maxPrice;

  // Any refinement filter (from text OR URL) means the user wants live
  // deals; the card reference list is then explicitly reference-only.
  const active = hasActiveDealFilters({
    type: n.type,
    grader: n.grader,
    grade: n.grade,
    listing: n.listing,
    minPrice: n.minPrice,
    maxPrice: n.maxPrice,
  });
  if (active) next.result_mode = "deals";

  return {
    intent: next,
    notes: n.notes,
    activeFilters: {
      type: n.type,
      grader: n.grader,
      grade: n.grade,
      listing: n.listing,
      minPrice: n.minPrice,
      maxPrice: n.maxPrice,
    },
    filtersFromUrl,
    hasActiveFilters: active,
  };
}

// activeFilters (normalized) -> a plain {k:v} of ONLY the non-default
// params, for building a shareable URL: the applied-filter chips, the
// "View all matching <species> deals" /pokemon link, canonical filter
// links. Never includes q or any free text.
export function searchFiltersToQuery(activeFilters = {}) {
  const q = {};
  if (activeFilters.type === "graded" || activeFilters.type === "raw") q.type = activeFilters.type;
  if (activeFilters.grader) q.grader = activeFilters.grader;
  if (activeFilters.grade != null) q.grade = String(activeFilters.grade);
  if (activeFilters.listing === "BIN" || activeFilters.listing === "AUCTION")
    q.listing = activeFilters.listing;
  if (activeFilters.minPrice != null) q.minPrice = String(activeFilters.minPrice);
  if (activeFilters.maxPrice != null) q.maxPrice = String(activeFilters.maxPrice);
  return q;
}
