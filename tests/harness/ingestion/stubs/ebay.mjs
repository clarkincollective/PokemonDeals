// eBay Browse stub: serves saved listings from the active harness scenario
// and counts every would-be call. Pure helpers are re-exported from the real
// module so parsing behaviour is unchanged.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const real = require(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "lib", "ebay.js"));
const H = () => globalThis.__ingestHarness;
const count = (k) => { H().calls[k] = (H().calls[k] ?? 0) + 1; };

export const MARKETPLACES = real.MARKETPLACES;
export const cardConditionDescriptorContent = real.cardConditionDescriptorContent;
export const languageAspect = real.languageAspect;

export async function getBrowseRateLimit() {
  return { remaining: 4000, limit: 5000, reset: null };
}
export async function searchListings(query, marketplaceId) {
  count("searchListings");
  return { listings: H().listingsFor({ query, marketplaceId }), total: 1 };
}
export async function searchNewlyListed(marketplaceId) {
  count("searchNewlyListed");
  return H().listingsFor({ query: null, marketplaceId });
}
export async function getGradingDetails(listingId) {
  count("getGradingDetails");
  return H().gradingFor(listingId);
}
export async function getRawListingDetail() {
  count("getRawListingDetail");
  return { tier: "Near Mint", imageCount: 6, returnsAccepted: true, soldOut: false };
}
export async function getItemsByLegacyIds(legacyIds, marketplaceId) {
  count("getItemsByLegacyIds");
  const all = H().listingsFor({ query: null, marketplaceId });
  const want = new Set(legacyIds.map(String));
  return { listings: all.filter((l) => want.has(String(l.listingId).split("|")[1])), calls: legacyIds.length };
}
