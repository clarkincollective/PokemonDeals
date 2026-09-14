// PokemonPriceTracker stub: references come from the saved evidence only.
const H = () => globalThis.__ingestHarness;
const count = (k) => { H().calls[k] = (H().calls[k] ?? 0) + 1; };

export async function getConditionPrices(tcgplayerId) {
  count("getConditionPrices");
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
  H().gradedPriceRequests.push(`${tcgplayerId}|${grader}|${grade}`);
  const price = H().gradedReferenceFor(String(tcgplayerId), grader, grade);
  return price == null ? null : { price, saleCount: 10, lastSaleDate: "2026-09-01", confidence: "high", history: [], recentSales: [] };
}
