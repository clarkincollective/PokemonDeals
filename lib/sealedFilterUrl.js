// The /sealed-deals catalogue's filter state, as URL state. Pure, no React,
// no DOM - CommonJS so tests import it directly.
//
// AUDIT 2026-09-23, FINDING 4. The catalogue could already filter: the API
// accepted q / type / set / deals and the browser built exactly those
// parameters. What it could not do was ADDRESS a filtered state - the page
// read no search parameters and the browser never wrote any, so typing
// "151" filtered 2,352 products down to 36 while the address bar still said
// "/sealed-deals". Nothing could be linked to or shared, which is why every
// named product in a guide pointed at the unfiltered catalogue.
//
// THE PRODUCT SELECTION IS EXCLUSIVE. `product` names ONE catalogue row by
// its exact id. While it is set, the browse filters (q / type / set / deals)
// are not applied on top of it: a text or type filter layered over a single
// known product is a hidden conflicting filter that can only ever hide the
// thing the reader asked for. Changing a browse filter therefore CLEARS the
// product selection, and the interface says so rather than silently
// dropping it.

const PRODUCT = "product";
const FILTER_PARAMS = Object.freeze([PRODUCT, "set", "type", "q", "deals"]);

// A catalogue id is digits. Anything else is not a product we can resolve,
// and must not fall through to a text search that would present some other
// product as the requested one.
const VALID_PRODUCT_ID = /^[0-9]{1,20}$/;

function parseSealedFilters(search) {
  const sp = new URLSearchParams(typeof search === "string" ? search : "");
  const rawProduct = (sp.get(PRODUCT) ?? "").trim();
  const product = VALID_PRODUCT_ID.test(rawProduct) ? rawProduct : null;
  return {
    product,
    // recorded so the interface can say "that link named a product we
    // cannot resolve" instead of quietly showing the whole catalogue
    invalidProduct: rawProduct !== "" && product === null ? rawProduct.slice(0, 32) : null,
    set: (sp.get("set") ?? "").trim() || null,
    type: (sp.get("type") ?? "").trim() || "all",
    q: (sp.get("q") ?? "").slice(0, 80),
    dealsOnly: sp.get("deals") === "1",
  };
}

// Is any browse filter (i.e. not the exact product selection) active?
const hasBrowseFilters = (f) => Boolean(f.q?.trim()) || (f.type && f.type !== "all") || Boolean(f.dealsOnly) || Boolean(f.set);

// Build the next query string. `patch` names only what changed.
//
// Unrelated parameters are PRESERVED untouched - utm_*, gclid, an affiliate
// campaign tag and anything else a reader arrived with survive a filter
// change, so attribution is not destroyed by using the page.
function buildSealedSearch(currentSearch, patch = {}) {
  const sp = new URLSearchParams(typeof currentSearch === "string" ? currentSearch : "");
  const next = { ...patch };

  // Exclusivity, in one place: selecting a product drops the browse
  // filters; touching a browse filter drops the product.
  const selectsProduct = Object.prototype.hasOwnProperty.call(next, PRODUCT) && next[PRODUCT];
  const touchesBrowse = ["q", "type", "deals", "set"].some((k) => Object.prototype.hasOwnProperty.call(next, k));
  if (selectsProduct) for (const k of ["q", "type", "deals", "set"]) sp.delete(k);
  else if (touchesBrowse) sp.delete(PRODUCT);

  for (const [k, v] of Object.entries(next)) {
    const empty = v == null || v === "" || v === false || (k === "type" && v === "all");
    if (empty) sp.delete(k);
    else sp.set(k, v === true ? "1" : String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

// Does this URL represent a filtered state? Used to decide noindex.
const isFilteredSearch = (search) => {
  const sp = new URLSearchParams(typeof search === "string" ? search : "");
  return FILTER_PARAMS.some((p) => {
    const v = sp.get(p);
    return v != null && v !== "";
  });
};

module.exports = {
  PRODUCT,
  FILTER_PARAMS,
  VALID_PRODUCT_ID,
  parseSealedFilters,
  buildSealedSearch,
  hasBrowseFilters,
  isFilteredSearch,
};
