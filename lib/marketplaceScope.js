// Marketplace scope for listing pages (marketplace-broaden-r1).
//
// `?country=` names an eBay MARKETPLACE: which eBay site a stored listing
// copy was found on (an exact match on deals.marketplace). It is not the
// visitor's delivery destination, the seller's location or the currency.
//
//   ?country=EBAY_XX  one marketplace
//   ?country=all      an EXPLICIT "All marketplaces" choice. It is a real
//                     URL value (not an absent param) so RegionRedirect
//                     never replaces it with a stored or geo-detected
//                     region, and it survives filters, pagination, reload
//                     and back/forward like any other query value.
//   no ?country=      the page's existing default (a pinned page's
//                     RegionRedirect may still apply the visitor's region)
//
// Loaders receive marketplaceFilterValue(raw): null for "all" (no
// marketplace filter), otherwise the value exactly as before.
// Browser-safe: no server imports.

import { MARKETPLACES } from "./ebayLinks.js";

export const ALL_MARKETPLACES = "all";
export const MARKETPLACE_COUNT = Object.keys(MARKETPLACES).length;

export function isAllMarketplaces(raw) {
  return typeof raw === "string" && raw.trim().toLowerCase() === ALL_MARKETPLACES;
}

// The value a data loader filters on: null = every marketplace.
export function marketplaceFilterValue(raw) {
  if (raw == null || raw === "") return null;
  if (isAllMarketplaces(raw)) return null;
  return String(raw);
}

// A single, known marketplace is selected (not "all", not absent, not junk).
export function selectedMarketplace(raw) {
  return typeof raw === "string" && Object.prototype.hasOwnProperty.call(MARKETPLACES, raw) ? raw : null;
}

// "eBay Germany". null for anything that is not a known marketplace.
export function marketplaceName(code) {
  const m = selectedMarketplace(code) ? MARKETPLACES[code] : null;
  return m ? `eBay ${m.label}` : null;
}

// The same URL with every current filter kept, the marketplace widened to
// all, and pagination reset. defaultIsAll: a page whose own default is
// already every marketplace (/deals) gets the clean URL instead of a
// duplicate ?country=all variant.
export function allMarketplacesHref(currentParams, basePath = "/", { defaultIsAll = false } = {}) {
  const params = new URLSearchParams(currentParams);
  if (defaultIsAll) params.delete("country");
  else params.set("country", ALL_MARKETPLACES);
  params.delete("page");
  if (!params.toString()) return basePath;
  return `${basePath}?${params.toString()}`;
}

// Shown wherever results span more than one marketplace.
export const DELIVERY_NOT_CONFIRMED =
  "Listings come from all six eBay marketplaces. Delivery to your location isn't confirmed — check shipping on the eBay listing before you buy.";
