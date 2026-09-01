// SEO Phase 3 closeout - a SMALL deterministic reranking layer over the
// catalogue-search results the provider (PokemonPriceTracker searchCards)
// returns. It does NOT replace the search engine and it does NOT touch
// deal identity matching (lib/dealMatching listingMatchesCard) - it only
// reorders the page of results already in hand, using trustworthy
// catalogue fields (name / set / collector number) plus the existing
// specialty classifier, so an exact-printing lookup surfaces the exact
// printing. Ties keep the provider's order, so fuzzy/relevance results
// (e.g. "Charzard" -> Charizard) are preserved.
//
// Relative import so `node --test` can load it directly.
import { isSpecialtyCard } from "./catalogueView.js";

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
const tokens = (s) => norm(s).split(" ").filter(Boolean);
const stripZeros = (s) => String(s ?? "").replace(/^0+(?=\d)/, "");

// Collector numbers a query mentions: "4/102", "215 / 203",
// set-prefixed "XY95" / "SM221", and bare 1-3 digit runs. Normalised so
// "004/130" and "4/130" compare equal.
function queryNumbers(q) {
  const out = new Set();
  const s = String(q ?? "");
  for (const m of s.matchAll(/\b(\d{1,4})\s*\/\s*(\d{1,4})\b/g)) {
    out.add(`${stripZeros(m[1])}/${stripZeros(m[2])}`);
  }
  for (const m of s.matchAll(/\b([a-z]{1,4}\d{1,4}[a-z]?)\b/gi)) out.add(m[1].toLowerCase());
  for (const m of s.matchAll(/\b(\d{1,3})\b/g)) out.add(stripZeros(m[1]));
  return out;
}
function cardNumberForms(cardNumber) {
  const out = new Set();
  const raw = String(cardNumber ?? "").trim();
  if (!raw) return out;
  const low = raw.toLowerCase();
  out.add(low);
  const slash = low.match(/^(\d{1,4})\s*\/\s*(\d{1,4})$/);
  if (slash) out.add(`${stripZeros(slash[1])}/${stripZeros(slash[2])}`);
  const prefixed = low.match(/^([a-z]{1,4}\d{1,4}[a-z]?)$/);
  if (prefixed) out.add(prefixed[1]);
  const bare = low.match(/^(\d{1,4})[a-z]?$/);
  if (bare) out.add(stripZeros(bare[1]));
  const lead = low.match(/^([a-z]{1,4})\s*[- ]?\s*(\d{1,4})$/); // "XY 95"
  if (lead) out.add(`${lead[1]}${stripZeros(lead[2])}`);
  return out;
}

// Query mentions specialty intent -> the specialty demotion is disabled
// (and specialty prints get a small bonus). Mirrors lib/catalogueView's
// SPECIALTY_SETS vocabulary; no second classifier.
const SPECIALTY_INTENT = /\b(jumbo|oversized|over-sized|box\s*topper|world\s*championship|wcd|championship\s*deck)\b/i;

// A contiguous run of `needle` tokens appears inside `hay` tokens.
function hasTokenRun(hay, needle) {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

// One result's score for one query. Higher = more likely the exact
// printing the searcher meant. Deterministic; only catalogue fields.
export function scoreCatalogResult(result, query) {
  const qTokens = tokens(query);
  if (qTokens.length === 0) return 0;
  const qNums = queryNumbers(query);
  const specialtyIntent = SPECIALTY_INTENT.test(String(query ?? ""));

  const nameTokens = tokens(result.name);
  const setTokens = tokens(result.set);
  const numForms = cardNumberForms(result.cardNumber);

  // Query tokens that describe the NAME = query minus this result's set
  // tokens minus number-looking tokens. So set precision is a separate
  // axis from name exactness.
  const nameQ = qTokens.filter(
    (t) => !setTokens.includes(t) && !/^\d/.test(t) && !/^[a-z]{1,4}\d/.test(t)
  );

  let score = 0;

  // 2 - exact normalized card-name match
  if (nameQ.length > 0 && norm(nameQ.join(" ")) === norm(result.name)) score += 100;
  // ...else every name query token present as a whole word in the name
  else if (nameQ.length > 0 && nameQ.every((t) => nameTokens.includes(t))) score += 55;
  // 5 - strong prefix match
  else if (nameQ.length > 0 && hasTokenRun(nameTokens, nameQ)) score += 30;

  // 3 - exact set phrase. Token-boundary: "base set" is a run inside
  // "base set 2", so BOTH match a "base set 2" query - but the longer
  // exact set (more tokens matched contiguously) scores higher, so
  // "Base Set 2" outranks "Base Set" when the query says "Base Set 2",
  // while "Base Set" still wins a plain "Base Set" query (where the
  // 3-token "base set 2" run isn't present at all).
  if (setTokens.length > 0 && hasTokenRun(qTokens, setTokens)) {
    score += 40 + 10 * setTokens.length;
  }
  // ...else partial set token overlap (same family, less credit)
  else if (setTokens.length > 0) {
    const overlap = setTokens.filter((t) => qTokens.includes(t)).length;
    if (overlap > 0) score += 12 * (overlap / setTokens.length);
  }

  // 1 / 4 - collector number evidence
  if (qNums.size > 0 && [...numForms].some((f) => qNums.has(f))) score += 45;

  // 4 - specialty (Jumbo / World Championship) demotion, overridden by
  // explicit specialty intent in the query.
  if (isSpecialtyCard(result)) score += specialtyIntent ? 20 : -80;

  // tiny nudge: a priced result is a more useful price-lookup landing
  if (result.marketPrice != null) score += 1;

  return score;
}

// Stable rerank of a page of results. Provider order is the tiebreak, so
// fuzzy/relevance results are never lost - only reordered when the
// catalogue fields give a clear reason to.
export function rerankCatalogResults(results, query) {
  const list = Array.isArray(results) ? results.slice() : [];
  if (!query || list.length < 2) return list;
  const scored = list.map((r, i) => ({ r, i, s: scoreCatalogResult(r, query) }));
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.map((x) => x.r);
}
