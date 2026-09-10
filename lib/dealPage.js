// Pure /deals/[id] page rules - no data access, no Next imports - so the
// title ladder and the expired-listing lifecycle decision are unit-
// testable with `node --test` and shared by nothing else by accident.

import { catalogCardSlug } from "./cardSlug.js";

// Same budget as lib/cardSlug.js's card titles: the authored part of the
// <title> (before " | Pokemon Deal Finder") should stay near Google's
// display width; whole rungs only, never a mid-word clip.
const TITLE_CORE_MAX = 63;

// A live deal's title keeps the card identity AND the deal intent ahead of
// the set context: dropping "- N% below market" first (the old rule) left
// a long-set-name deal titled exactly like the permanent card page, so the
// two competed for the same "card + set" query with no deal hook left.
//   1. Card (Set) - N% below market
//   2. Card - N% below market
//   3. Card Deal
//   4. Card
// discountPct is the deal's own rounded real figure; nothing is invented
// here - a missing/invalid discount just skips the discount rungs.
export function dealPageTitle({ cardName, cardSet = null, discountPct = null }) {
  const name = String(cardName ?? "").trim();
  const set = cardSet ? String(cardSet).trim() : "";
  const pct = Number.isFinite(Number(discountPct)) && Number(discountPct) > 0 ? Math.round(Number(discountPct)) : null;
  const suffix = pct != null ? ` - ${pct}% below market` : "";
  const candidates = [];
  if (set && suffix) candidates.push(`${name} (${set})${suffix}`);
  if (suffix) candidates.push(`${name}${suffix}`);
  if (set && !suffix) candidates.push(`${name} (${set})`);
  candidates.push(`${name} Deal`);
  for (const c of candidates) if (c.length <= TITLE_CORE_MAX) return c;
  return name;
}

// The permanent /cards/[slug] a deal's card would resolve to by slug
// scheme (catalogCardSlug, identical to the hub / catalogue routes).
// English only - the catalogue routes are English; a Japanese listing has
// no permanent card page to send anyone to. The caller must still verify
// the slug actually resolves (resolveCatalogCard) before redirecting.
export function dealCatalogSlugCandidate(deal) {
  const name = deal?.watchlist?.name ?? deal?.card_name ?? null;
  const set = deal?.watchlist?.set ?? deal?.card_set ?? null;
  const language = deal?.watchlist?.language ?? deal?.card_language ?? "english";
  if (!name || !set) return null;
  if (String(language).toLowerCase() === "japanese") return null;
  return catalogCardSlug(name, set);
}

// What a /deals/[id] request should do once the listing is not a live,
// displayable deal:
//   - no row at all                      -> gone (404)
//   - still is_active but display-gated  -> render the honest "ended"
//     state (200 + noindex) - the row can become displayable again as its
//     screening / trust signals update, so it is never permanently
//     redirected away
//   - genuinely inactive (sold / ended / retired):
//       -> permanent redirect to the same card's live hub if one exists
//       -> else to its verified permanent catalogue page
//       -> else gone (404) - never a homepage / index / species / set page
//          just to avoid a dead URL
// `hubSlug` / `catalogSlug` are passed in only when the caller has
// verified they resolve to a real page.
export function expiredDealDestination({ deal, hubSlug = null, catalogSlug = null }) {
  if (!deal) return { action: "gone", reason: "NO_ROW" };
  if (deal.is_active) return { action: "render", reason: "ACTIVE_DISPLAY_GATED" };
  if (hubSlug) return { action: "redirect", href: `/cards/${hubSlug}`, reason: "LIVE_HUB" };
  if (catalogSlug) return { action: "redirect", href: `/cards/${catalogSlug}`, reason: "CATALOGUE_CARD" };
  return { action: "gone", reason: "NO_PERMANENT_CARD_PAGE" };
}
