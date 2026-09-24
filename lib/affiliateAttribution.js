// AUDIT 2026-09-23, FINDING 5 — bounded affiliate source attribution.
//
// THE PROBLEM. Outbound affiliate links carried a single flat token in
// eBay's `customid` sub-ID, drawn from lib/affiliateSurfaces.js's enum.
// A production census of the rendered HTML on 2026-09-25 (no affiliate
// link was requested) found 395 of 475 sampled outbound eBay hrefs —
// 83.2% — on the fallback value "other":
//
//   /sealed-deals (and ?product=)   178 hrefs   100% other
//   /japanese-cards                  24 hrefs   100% other
//   /latest-releases                 12 hrefs   100% other
//   /guides/pokemon-151-buying-guide  3 hrefs   100% other
//
// so EPN could not tell the sealed catalogue apart from a guide, and the
// site's single largest source of outbound links was invisible.
//
// TWO CAUSES, not one:
//   1. Real surfaces were never added to the closed enum — `sealed_hub`,
//      `japanese_cards`, `latest_releases`, `guide_offers`, `sealed` all
//      fell through to "other". A test even PINNED two of them as "other".
//   2. The enum fused two different questions into one token. "home_best"
//      answers *which page* and *which module on it* at once, so there was
//      no room to say "the sealed catalogue's browse grid" versus "the
//      sealed catalogue's selected-product panel" without inventing a new
//      fused token for every combination.
//
// THE SHAPE. One identifier, two parts, both from closed vocabularies:
//
//     customid = "<page>-<placement>"      e.g. "sealed-selected"
//
//   page       WHERE the outbound click happened. Never an acquisition
//              source: a reader who arrives from a guide and clicks on
//              /sealed-deals is `sealed`, not `guide`. The guide is the
//              LANDING source, and that already lives — correctly, and
//              only where it is reliably captured — in the analytics
//              landing context (traffic_source / utm_* / landing_page_type
//              set once by components/analytics/AnalyticsBootstrap.js).
//              It is deliberately NOT copied into a network parameter.
//   placement  WHICH control on that page produced the click.
//
// Both halves are closed Sets of literal strings. There is no code path
// that concatenates caller-supplied text into either half, so a card name,
// a search query, a deal/listing/product id, a price, a country or any
// user/session identity cannot reach the network parameter even by
// mistake — the same structural guarantee lib/affiliateSurfaces.js gave,
// now with enough vocabulary to be useful.
//
// See docs/ebay-affiliate-attribution.md for the migration table and how
// to read the new identifiers in the existing reports.

// ---------------------------------------------------------------- pages

// WHERE the click happened. One token per page TYPE, never per URL.
const AFFILIATE_PAGES = Object.freeze(
  new Set([
    "home",
    "deals", // /deals index
    "deal", // /deals/[id] one listing
    "best_finds",
    "search", // /search price checker
    "card", // /cards/[slug]
    "pokemon", // /pokemon and /pokemon/[slug]
    "set", // /sets/[slug]
    "sealed", // /sealed-deals catalogue
    "sealed_item", // /sealed-deals/[id] one sealed listing
    "guide", // /guides/*
    "japanese", // /japanese-cards
    "latest", // /latest-releases
    "other", // genuinely unknown — the explicit fallback
  ])
);

// ----------------------------------------------------------- placements

// WHICH control on that page. Kept coarse on purpose: a placement names a
// module, never an individual card, listing or rank.
const AFFILIATE_PLACEMENTS = Object.freeze(
  new Set([
    "best", // homepage flagship row
    "all", // homepage all-deals row
    "fresh", // homepage just-added row
    "ending", // homepage auctions-ending row
    "grid", // the page's main tile grid
    "catalog", // a catalogue/browse module inside a larger page
    "feature", // a curated strip of unrelated featured deals
    "selected", // the exact product a link asked for (finding 4's panel)
    "offer", // the page's own primary buy CTA
    "sticky", // the persistent/sticky buy CTA
    "related", // a "more like this" module
    "search", // a "search eBay for this" CTA rather than one listing
    "reference", // a reference-price tile's CTA (no qualifying offer)
    "condition", // the per-condition breakdown grid
    "variant", // the per-variant price grid
    "sealed", // a sealed-product module inside a non-sealed page
    "sold", // recent sold comps
    "other", // genuinely unknown — the explicit fallback
  ])
);

const UNKNOWN = "other";

// A conservative ceiling. eBay Partner Network documents `customid` as
// accepting up to 256 characters; nothing this module can emit approaches
// that, and the cap is asserted in the tests so a future vocabulary
// addition cannot quietly grow past a safe length. The charset is limited
// to [a-z0-9_-] so the value needs no escaping in a query string and
// cannot alter the URL it rides on.
const MAX_ATTRIBUTION_LEN = 40;
const VALID_ATTRIBUTION = /^[a-z0-9_]+-[a-z0-9_]+$/;

const token = (set, value) => (typeof value === "string" && set.has(value) ? value : UNKNOWN);

const affiliatePage = (value) => token(AFFILIATE_PAGES, value);
const affiliatePlacement = (value) => token(AFFILIATE_PLACEMENTS, value);

// THE one function allowed to decide what reaches a network parameter.
// Anything unrecognised — undefined, a typo, a caller accidentally passing
// something identity-shaped — degrades to the explicit "other" half rather
// than reaching the network verbatim.
function attributionId(page, placement) {
  const id = `${affiliatePage(page)}-${affiliatePlacement(placement)}`;
  // Belt and braces: the vocabularies above cannot produce anything else,
  // and if a future edit ever made them, this refuses it rather than
  // emitting it.
  return VALID_ATTRIBUTION.test(id) && id.length <= MAX_ATTRIBUTION_LEN ? id : `${UNKNOWN}-${UNKNOWN}`;
}

// ------------------------------------------- the existing pageName prop

// The site already threads a `pageName` prop through DealCard /
// SealedDealCard / SpeciesCard / DealGrid for analytics page-type context.
// Reusing it as the SOURCE — rather than inventing a second parallel prop
// at every render site — is what made the original wiring a one-line
// change per component, and it stays that way here. pageName is a coarse
// page-TYPE label, never a user/session/card identity, so reading it
// crosses no privacy boundary.
//
// Every pageName this repo actually passes is listed. An unmapped one
// resolves to "other-other" — honest, never a guess — and the test suite
// fails if a pageName in use is missing from this table.
const PAGE_NAME_TO_ATTRIBUTION = Object.freeze({
  // homepage lanes
  home_best: ["home", "best"],
  home_ending: ["home", "ending"],
  home_all_deals: ["home", "all"],
  home_fresh: ["home", "fresh"],
  // index / listing pages
  best_finds: ["best_finds", "grid"],
  deals_index: ["deals", "grid"],
  price_checker: ["search", "grid"],
  // card / species / set
  card_hub: ["card", "offer"],
  species_detail: ["pokemon", "grid"],
  species_catalog: ["pokemon", "catalog"],
  species_card: ["pokemon", "grid"],
  set_detail: ["set", "grid"],
  set_detail_sealed: ["set", "sealed"],
  // deal detail
  deal_related: ["deal", "related"],
  // FINDING 5 — surfaces that had no token at all and so were "other":
  sealed: ["sealed", "feature"], // /sealed-deals "Live sealed deals right now"
  sealed_hub: ["sealed", "grid"], // /sealed-deals browse grid
  sealed_product: ["sealed", "selected"], // finding 4's selected-product panel
  guide_offers: ["guide", "offer"], // GuideLiveOffers inside a guide article
  japanese_cards: ["japanese", "grid"],
  latest_releases: ["latest", "grid"],
});

function attributionForPageName(pageName, placementOverride) {
  const pair = PAGE_NAME_TO_ATTRIBUTION[pageName];
  if (!pair) return attributionId(UNKNOWN, placementOverride ?? UNKNOWN);
  return attributionId(pair[0], placementOverride ?? pair[1]);
}

// The same thing as an options object, for the URL builders. Keeping this
// here rather than spelling `{ page: ..., placement: ... }` at every call
// site is what stops a component inventing its own pair by hand.
function attributionOptionsForPageName(pageName, placementOverride) {
  const pair = PAGE_NAME_TO_ATTRIBUTION[pageName];
  return pair
    ? { page: pair[0], placement: placementOverride ?? pair[1] }
    : { page: UNKNOWN, placement: placementOverride ?? UNKNOWN };
}

// The page half on its own, so a component that knows its page but is
// rendering several different controls can pass one page and vary the
// placement per control.
function pageForPageName(pageName) {
  const pair = PAGE_NAME_TO_ATTRIBUTION[pageName];
  return pair ? pair[0] : UNKNOWN;
}

// ------------------------------------------------- documented migration

// The values EPN recorded before this deployment. They are NOT renamed in
// history — historical "other" and historical "home_best" rows stay
// exactly as they are. This table exists so the ~15 call sites that still
// pass the old single `surface` argument keep working and resolve to the
// same place the new two-part form would, instead of silently becoming
// "other-other" during the migration.
const LEGACY_SURFACE_TO_ATTRIBUTION = Object.freeze({
  home_best: ["home", "best"],
  home_auction: ["home", "ending"],
  home_all: ["home", "all"],
  home_just_added: ["home", "fresh"],
  best_finds: ["best_finds", "grid"],
  deals: ["deals", "grid"],
  auctions: ["home", "ending"],
  search: ["search", "grid"],
  pokemon: ["pokemon", "grid"],
  set: ["set", "grid"],
  card: ["card", "offer"],
  deal_page: ["deal", "offer"],
  recently_viewed: ["home", "related"],
  other: [UNKNOWN, UNKNOWN],
});

// Normalise "either shape a caller may hold" into the options object the
// URL builders take: a legacy surface string, or an explicit pair.
function asAttributionOptions(surfaceOrOptions) {
  return surfaceOrOptions && typeof surfaceOrOptions === "object"
    ? surfaceOrOptions
    : { surface: surfaceOrOptions };
}

// A shared component (the variant grid, the reference tile, the recent-
// sold list) is rendered on more than one page, so it cannot know its own
// page - but it DOES know its own role. This takes whatever its caller
// passed (a legacy surface string or a { page, placement } object), keeps
// the page half, and stamps the component's own placement over it. That
// is how /cards/[slug] and /deals/[id] can share one variant grid and
// still be told apart in a report.
function withPlacement(surfaceOrOptions, placement) {
  const page =
    surfaceOrOptions && typeof surfaceOrOptions === "object"
      ? affiliatePage(surfaceOrOptions.page)
      : affiliatePage((LEGACY_SURFACE_TO_ATTRIBUTION[surfaceOrOptions] ?? [])[0]);
  return { page, placement: affiliatePlacement(placement) };
}

// Resolve whatever a caller supplied into one identifier. Explicit
// page/placement always wins; a legacy `surface` is translated; anything
// else is the explicit fallback.
function resolveAttribution({ page, placement, surface } = {}) {
  if (page != null || placement != null) return attributionId(page, placement);
  const legacy = typeof surface === "string" ? LEGACY_SURFACE_TO_ATTRIBUTION[surface] : null;
  if (legacy) return attributionId(legacy[0], placement ?? legacy[1]);
  return attributionId(UNKNOWN, UNKNOWN);
}

// ------------------------------------------------------ Impact/TCGPlayer

// TCGPlayer's programme runs through impact.com, NOT through EPN, and the
// two contracts are not the same — eBay's sub-ID rides in `customid`,
// Impact's in `subId1`. They are kept in separate functions on purpose so
// neither can inherit the other's parameter name. The identifier VALUE is
// deliberately the same string, because that is what makes a PostHog row
// joinable to either network's report.
const IMPACT_SUBID_PARAM = "subId1";

// ---------------------------------------------- reading it back off a URL

// What attribution is this already-built href actually carrying? Used by
// the click components so the analytics event reports exactly the value
// the NETWORK will receive, rather than a second, separately-plumbed
// guess that could drift out of step with the href beside it.
function attributionFromHref(href) {
  try {
    const u = new URL(href);
    const raw = u.searchParams.get("customid") ?? u.searchParams.get(IMPACT_SUBID_PARAM);
    if (typeof raw !== "string" || !VALID_ATTRIBUTION.test(raw)) return null;
    const [page, placement] = raw.split("-");
    // Only report values from the live vocabularies; a legacy single-token
    // value (or anything else) reads as null rather than being re-split
    // into two halves that never meant that.
    if (!AFFILIATE_PAGES.has(page) || !AFFILIATE_PLACEMENTS.has(placement)) return null;
    return { id: raw, page, placement };
  } catch {
    return null;
  }
}

module.exports = {
  AFFILIATE_PAGES,
  AFFILIATE_PLACEMENTS,
  MAX_ATTRIBUTION_LEN,
  VALID_ATTRIBUTION,
  PAGE_NAME_TO_ATTRIBUTION,
  LEGACY_SURFACE_TO_ATTRIBUTION,
  IMPACT_SUBID_PARAM,
  affiliatePage,
  affiliatePlacement,
  attributionId,
  attributionForPageName,
  attributionOptionsForPageName,
  pageForPageName,
  resolveAttribution,
  asAttributionOptions,
  withPlacement,
  attributionFromHref,
};
