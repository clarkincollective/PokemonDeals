// AUDIT 2026-09-23, FINDING 8 — a variant search must keep the card's
// identity instead of broadening to every card sharing its name.
//
// THE DEFECT. components/VariantPriceGrid built its eBay query as
// `cardName` (raw tile) or `${cardName} ${grade}` (graded tile), and
// components/CardMarketPanel - the only thing that renders it - was never
// passed the set or the collector number, so they could not have been
// used. Measured on live hubs 2026-09-24:
//
//   "Scizor GX PSA 10"                 (really Hidden Fates: Shiny Vault
//                                       SV72/SV94; Scizor GX also exists
//                                       in SM - Burning Shadows)
//   "Metagross (Delta Species) PSA 9"  (really EX Delta Species 11/113)
//   "Jessie & James (Full Art) PSA 10" (really Hidden Fates 68/68)
//
// and the catalogue holds "Gengar (Prime)" in TWO sets under the SAME
// number 94/102 (Triumphant and ME: 30th Celebration Classic Collection),
// so a name-only query cannot separate them even in principle.
//
// WHAT THIS BUILDS FROM, and only this - every field is passed in by a
// caller that already holds it; nothing here reads a database, infers a
// finish, or fills a gap with a guess:
//
//   name         the catalogue/display name
//   cardNumber   the collector number, verbatim - prefixes ("XY112",
//                "SV72/SV94") and leading zeros ("009/102") are identity,
//                not formatting, and are never trimmed
//   set          the set name, lightly normalised for SEARCH only
//   language     included only when it is established AND not English
//   grade        the grader + grade the reader actually selected
//
// WHAT IT DELIBERATELY DOES NOT ADD:
//
//   printing/finish. The analysis exposes `referencePrinting`, but that
//   names the printing the REFERENCE PRICE came from, not a finish the
//   reader selected or that the product id establishes - and its
//   companion flag `referenceExact` is about the CONDITION match, not the
//   printing. Sellers also rarely write "Unlimited Holofoil" in a title,
//   so adding it would filter on words that are mostly absent. It is left
//   out rather than invented; the builder accepts an explicit `printing`
//   for a caller that ever does verify one, and no caller passes it today.

const { cardDisplayName, collectorNumberFromName } = require("./cardName");

// TCGplayer's set names carry a series/era prefix that is a cataloguing
// convention, not seller language: nobody lists "SWSH08: Fusion Strike"
// on eBay, they list "Fusion Strike". 42 of the 86 live set names carry
// one. Stripping it is a SEARCH-ONLY transform - the stored set name, the
// slug and every displayed label are untouched.
//
// Requires a real separator, so "EX Delta Species", "SM Promos" and
// "XY Promos" (no separator) are left whole. An inner colon is flattened
// to a space: "Hidden Fates: Shiny Vault" -> "Hidden Fates Shiny Vault".
const ERA_PREFIX = /^[A-Za-z]{2,6}\d{0,2}\s*[:-]\s+/;

function setForSearch(set) {
  const raw = String(set ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(ERA_PREFIX, "")
    .replace(/[:]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Compare two collector numbers for "is this the same number", ignoring
// case, spacing and leading zeros ("009/102" === "9/102"). Used only to
// decide whether a number is ALREADY in the name - never to rewrite the
// number that goes into the query, which is always verbatim.
const sameNumber = (a, b) => {
  const norm = (v) =>
    String(v ?? "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .split("/")
      .map((part) => part.replace(/^0+(?=\d)/, ""))
      .join("/");
  const na = norm(a);
  return na !== "" && na === norm(b);
};

// The name with its own embedded collector number removed, so a query
// never repeats it: "Jirachi - XY112" + XY112 -> "Jirachi".
function nameWithoutNumber(name, cardNumber) {
  const display = cardDisplayName({ name });
  if (!display) return "";
  const embedded = collectorNumberFromName(display);
  if (!embedded) return display;
  // Only strip when it is the SAME number we are about to add back. A
  // different number in the name is part of the card's identity.
  if (cardNumber && !sameNumber(embedded, cardNumber)) return display;
  const stripped = display
    .replace(new RegExp(`\\s*[-–—]?\\s*${embedded.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return stripped.length >= 2 ? stripped : display;
}

// Language is only worth adding when it is established AND changes the
// search: an English card is the default on the marketplaces scanned, so
// saying "English" only narrows against sellers who omit the word.
function languageForSearch(language) {
  const v = String(language ?? "").trim().toLowerCase();
  if (!v || v === "english") return "";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

// THE shared query. Returns a plain string for buildEbaySearchLink, which
// handles URL encoding - nothing here pre-encodes.
//
// Absent fields are simply absent: the query keeps whatever identity is
// verified and never substitutes specificity it does not have.
function buildCardSearchQuery({
  name,
  set = null,
  cardNumber = null,
  language = null,
  grade = null,
  printing = null,
} = {}) {
  const number = cardNumber ?? collectorNumberFromName(name) ?? null;
  const parts = [
    nameWithoutNumber(name, number),
    number ? String(number).trim() : "",
    setForSearch(set),
    languageForSearch(language),
    printing ? String(printing).trim() : "",
    grade ? String(grade).trim() : "",
  ];
  return parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// The reader-facing label for one of these links. A search is a SEARCH:
// it is never described as available inventory, and never implies every
// result matches. `grade` makes it specific when the reader picked one.
function cardSearchLabel(grade) {
  const g = String(grade ?? "").trim();
  return g ? `Search eBay for ${g} copies` : "Search eBay listings";
}

module.exports = {
  ERA_PREFIX,
  setForSearch,
  nameWithoutNumber,
  languageForSearch,
  buildCardSearchQuery,
  cardSearchLabel,
};
