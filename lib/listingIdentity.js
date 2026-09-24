// AUDIT 2026-09-23, FINDING 6 — one eBay listing is one buying option.
//
// THE PROBLEM. The same eBay item is discoverable from several regional
// eBay sites, and the scanner stores one row per (marketplace, listing).
// Two rules for "is this the same listing?" had grown up side by side:
//
//   lib/allDealsInventory.js   key = listing_id                 (correct)
//   lib/speciesDealScope.js    key = marketplace + ":" + listing_id
//
// so /deals showed one tile per listing while the card hubs, the species
// counts and the filtered card grids showed one tile per REGIONAL ROW.
// Measured on live records, 2026-09-24 (active, source = ebay, through the
// existing display gate): 1,103 rows behind 998 distinct listings — 88
// listings stored for 2+ marketplaces, 105 surplus rows, and 75 of 637
// card hubs overstating their option count. The live Magneton hub said
// "12 active listings" over 6 real listings, one of which was stored four
// times (US, GB, CA, AU).
//
// THE KEY IS THE WHOLE listing_id, NOT THE ITEM NUMBER. eBay's RESTful id
// is "v1|<item number>|<variation>". Two rows sharing an item number but
// differing in the variation component are genuinely different offers (one
// listing selling several cards as variations) and must stay apart. So the
// grouping key keeps the variation and drops only the marketplace.
//
// A row with no listing_id groups under its own row id. Unknown identity
// never merges with anything — a missing field must not make two unrelated
// listings look like one.
//
// CHOOSING THE COPY. Copies disagree: eBay converts the price per site and
// shipping to a different country is a different quote. So never mix
// fields — one whole copy is chosen and its price, currency, shipping
// statement, savings qualifier and destination all travel together.
// Explicitly NOT "the numerically cheapest row": that would pick whichever
// site's conversion looked lowest on the day and quote a delivery basis the
// reader is not on. The order is the reader's own marketplace scope when
// they have chosen one, then the listing's home market, then a fixed
// marketplace order, then the lowest row id.
//
// chooseListingCopy and the marketplace order below moved here verbatim
// from lib/allDealsInventory.js, which keeps importing them, so /deals is
// byte-for-byte unaffected.

// The deterministic preference order when one eBay listing is stored for
// several marketplaces and none of them is the listing's home market.
const MARKETPLACE_PREFERENCE = Object.freeze(["EBAY_US", "EBAY_GB", "EBAY_CA", "EBAY_AU", "EBAY_DE", "EBAY_IT"]);

// The grouping key: one distinct eBay listing (variation included).
// NEVER the card, the title, the seller or the image - two different
// listings of the same card are two real buying options and must both show.
//
// `index` is the row's position in the batch being grouped, and is used
// ONLY when the row has neither a listing_id nor an id. That case is not
// hypothetical: on 2026-09-24 the aggregate query did not select either
// column, so every row keyed as "row:undefined" and every set's
// distinct-listing count collapsed to 1. The rule's whole guarantee is
// that unknown identity never merges, so it must hold even when the
// caller hands over rows with no identity at all.
function listingIdentityKey(row, index) {
  if (!row) return null;
  const id = row.listing_id;
  if (id != null && String(id).trim() !== "") return String(id);
  if (row.id != null) return `row:${row.id}`;
  return index == null ? "row:unknown" : `row:unknown:${index}`;
}

// True when this row's identity is known. A `row:<id>` key is a fallback,
// not an identity, and callers that report on grouping say so.
const hasKnownListingIdentity = (row) => Boolean(row && row.listing_id != null && String(row.listing_id).trim() !== "");

// One whole copy of a listing. `prefer` is the marketplace the reader has
// scoped to, when the surface supports that choice (the card hub's
// "Listing marketplace" filter, /deals' marketplace scope); it is honoured
// only when a copy for it actually exists.
function chooseListingCopy(copies, { prefer = null } = {}) {
  const rank = (r) => {
    const home = r.item_location_country ? `EBAY_${String(r.item_location_country).toUpperCase()}` : null;
    const pref = MARKETPLACE_PREFERENCE.indexOf(r.marketplace);
    return [
      prefer && r.marketplace === prefer ? 0 : 1,
      r.marketplace === home ? 0 : 1,
      pref === -1 ? 99 : pref,
      Number(r.id),
    ];
  };
  return [...copies].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || ra[3] - rb[3];
  })[0];
}

// Group rows into buying options, preserving input order of first sight.
// Returns [{ key, chosen, copies, marketplaces, otherMarketplaces }] so a
// caller can keep the regional availability it is collapsing.
function groupListings(rows, { prefer = null } = {}) {
  const groups = new Map();
  (rows ?? []).forEach((r, i) => {
    const k = listingIdentityKey(r, i);
    if (k == null) return;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });
  const out = [];
  for (const [key, copies] of groups) {
    const chosen = chooseListingCopy(copies, { prefer });
    const marketplaces = [...new Set(copies.map((c) => c.marketplace).filter(Boolean))].sort(
      (a, b) => MARKETPLACE_PREFERENCE.indexOf(a) - MARKETPLACE_PREFERENCE.indexOf(b)
    );
    out.push({
      key,
      chosen,
      copies,
      marketplaces,
      otherMarketplaces: marketplaces.filter((m) => m !== chosen.marketplace),
    });
  }
  return out;
}

// The rows to display: one per distinct listing. Each carries
// `regional_alternatives` - the OTHER eBay sites the same listing is also
// on - so collapsing the duplicates does not throw away the fact that it is
// available regionally. Every price, currency, shipping statement and
// savings qualifier on the row still comes from that one chosen copy.
function dedupeListings(rows, { prefer = null } = {}) {
  return groupListings(rows, { prefer }).map((g) =>
    g.otherMarketplaces.length ? { ...g.chosen, regional_alternatives: g.otherMarketplaces } : g.chosen
  );
}

// How many distinct buying options these rows represent. This is the
// number a reader may be shown; it must equal the number of options the
// surface actually renders.
function countDistinctListings(rows) {
  const seen = new Set();
  (rows ?? []).forEach((r, i) => {
    const k = listingIdentityKey(r, i);
    if (k != null) seen.add(k);
  });
  return seen.size;
}

module.exports = {
  MARKETPLACE_PREFERENCE,
  listingIdentityKey,
  hasKnownListingIdentity,
  chooseListingCopy,
  groupListings,
  dedupeListings,
  countDistinctListings,
};
