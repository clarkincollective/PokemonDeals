// eBay Browse stub: serves saved listings from the active harness scenario
// and counts every would-be call. Pure helpers are re-exported from the real
// module so parsing behaviour is unchanged.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const real = require(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "lib", "ebay.js"));
const H = () => globalThis.__ingestHarness;
// browse-budget-r1: the REAL per-attempt lease guard (same CJS module instance
// the routes attach their lease to), so a stubbed provider call is refused
// exactly where lib/ebay.fetchWithRetry would refuse it.
const telemetry = require(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "lib", "ebayTelemetry.js"));
const guard = () => {
  if (!telemetry.consumeBrowseAttempt()) {
    H().calls.attemptRefused = (H().calls.attemptRefused ?? 0) + 1;
    const e = new Error("Browse budget lease exhausted");
    e.name = "BrowseBudgetExhaustedError";
    throw e;
  }
};
const count = (k) => { H().calls[k] = (H().calls[k] ?? 0) + 1; };

export const MARKETPLACES = real.MARKETPLACES;
export const cardConditionDescriptorContent = real.cardConditionDescriptorContent;
export const languageAspect = real.languageAspect;

export async function getBrowseRateLimit() {
  return H().rateLimit ?? { remaining: 4000, limit: 5000, reset: null };
}
export async function searchListings(query, marketplaceId) {
  count("searchListings");
  return { listings: H().listingsFor({ query, marketplaceId }), total: 1 };
}
export async function searchNewlyListed(marketplaceId, { pages = 5 } = {}) {
  // alloc-rev2: one attempt per result page through the real per-attempt
  // guard, as lib/ebay.searchNewlyListed does (off/observe: always allowed)
  for (let p = 0; p < pages; p++) guard();
  count("searchNewlyListed");
  return H().listingsFor({ query: null, marketplaceId });
}
export async function getGradingDetails(listingId) {
  // one attempt, plus a second when the scenario models a 5xx retry
  guard();
  if (H().retryGradingFor?.(listingId)) guard();
  count("getGradingDetails");
  return H().gradingFor(listingId);
}
export async function getRawListingDetail() {
  // crossmatch-price-pilot-r1: one attempt through the real per-attempt guard,
  // as lib/ebay.fetchWithRetry does (off/observe without a guard: always allowed)
  guard();
  count("getRawListingDetail");
  return { tier: "Near Mint", imageCount: 6, returnsAccepted: true, soldOut: false };
}
export async function getItemsByLegacyIds(legacyIds, marketplaceId) {
  count("getItemsByLegacyIds");
  const all = H().listingsFor({ query: null, marketplaceId });
  const want = new Set(legacyIds.map(String));
  return { listings: all.filter((l) => want.has(String(l.listingId).split("|")[1])), calls: legacyIds.length };
}
// graded-retention-r1: verify-deals' single-item lookup. The scenario's
// snapshotFor decides the verdict; default is an inconclusive read.
export async function getListingSnapshot(legacyId, marketplaceId) {
  guard();
  count("getListingSnapshot");
  return H().snapshotFor?.(String(legacyId), marketplaceId) ?? { status: "UNKNOWN", calls: 1, evidence: "harness_default" };
}
