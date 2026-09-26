// PokemonPriceTracker stub: references come from the saved evidence only.
//
// 2026-09-26: `harness.pptExhausted = true` models the free tier after its
// 100 credits are gone - every billed lookup throws the same
// PptExhaustedError shape the real module's gate throws, so the route's
// saved-reference fallback is exercised exactly as it is in production.
// Attempts are still counted (calls.getConditionPrices etc.) so a test can
// prove the exhausted provider is asked at most once per card per run, and
// `calls.pptRefused` counts how many of those were refused.
const H = () => globalThis.__ingestHarness;
const count = (k) => { H().calls[k] = (H().calls[k] ?? 0) + 1; };

export const PPT_POOLS = Object.freeze({ credits: "credits", export: "export" });
export class PptExhaustedError extends Error {
  constructor(untilIso = "2026-09-27T00:00:00.000Z", reason = "harness_exhausted") {
    super(`PokemonPriceTracker unavailable until ${untilIso} (${reason})`);
    this.name = "PptExhaustedError";
    this.code = "ppt_exhausted";
    this.until = untilIso;
    this.reason = reason;
  }
}
export class PptPausedError extends Error {
  constructor() {
    super("PokemonPriceTracker paused (PPT_SAVED_DATA_MODE)");
    this.name = "PptPausedError";
    this.code = "ppt_paused";
  }
}
export function isPptUnavailableError(err) {
  return err?.code === "ppt_paused" || err?.code === "ppt_exhausted";
}
export async function isPptCircuitOpen() {
  return Boolean(H().pptExhausted);
}
export function gradeKey(grader, grade) {
  if (!grader || !grade) return null;
  return `${String(grader).toLowerCase()}${String(grade).replace(".", "_")}`;
}
export function isSentinelPrice(value) {
  return [999, 999.99, 9999, 9999.99, 99999, 99999.99].includes(Number(value));
}

function refuseIfExhausted() {
  if (H().pptExhausted) {
    count("pptRefused");
    throw new PptExhaustedError();
  }
}

export async function getConditionPrices(tcgplayerId) {
  count("getConditionPrices");
  refuseIfExhausted();
  const price = H().rawReferenceFor(String(tcgplayerId));
  if (price == null) return null;
  const ref = { price, condition: "Near Mint", printing: null };
  return {
    byCondition: { "Near Mint": price },
    fallbackPrice: price,
    byConditionReference: { "Near Mint": ref },
    fallbackReference: ref,
    lastUpdated: "2026-09-13T00:00:00Z",
  };
}

export async function getGradedPrice(tcgplayerId, grader, grade) {
  count("getGradedPrice");
  refuseIfExhausted();
  H().gradedPriceRequests.push(`${tcgplayerId}|${grader}|${grade}`);
  const price = H().gradedReferenceFor(String(tcgplayerId), grader, grade);
  return price == null ? null : { price, saleCount: 10, lastSaleDate: "2026-09-01", confidence: "high", history: [], recentSales: [] };
}
