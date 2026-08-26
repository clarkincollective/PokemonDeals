const BASE_URL = "https://www.pokemonpricetracker.com/api/v2/cards";

function apiKey() {
  const key = process.env.POKEMONPRICETRACKER_API_KEY;
  if (!key) throw new Error("Missing POKEMONPRICETRACKER_API_KEY");
  return key;
}

// e.g. ("PSA", "10") -> "psa10", ("CGC", "9.5") -> "cgc9_5" - matches the
// key format PokemonPriceTracker uses in its salesByGrade response.
function gradeKey(grader, grade) {
  if (!grader || !grade) return null;
  return `${grader.toLowerCase()}${String(grade).replace(".", "_")}`;
}

// Looks up real sold-comp pricing for a specific grader+grade of a card,
// reusing the same tcgplayerId already resolved for JustTCG lookups (both
// APIs key off TCGPlayer's product catalog).
async function getGradedPrice(tcgplayerId, grader, grade) {
  const key = gradeKey(grader, grade);
  if (!key) return null;

  const url = new URL(BASE_URL);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  url.searchParams.set("includeEbay", "true");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey()}` } });
  if (!res.ok)
    throw new Error(`PokemonPriceTracker request failed: ${res.status} ${await res.text()}`);

  const body = await res.json();
  // A tcgPlayerId lookup returns a single card object (data.ebay...), not
  // an array - unlike a free-text ?search= query, which returns data[].
  const gradeData = body.data?.ebay?.salesByGrade?.[key];
  if (!gradeData) return null;

  const price = gradeData.smartMarketPrice?.price ?? gradeData.medianPrice ?? null;
  if (price == null) return null;

  // priceHistory is keyed by date string -> { average, count, ... } for
  // this same grade. Comes back in the same response, so this costs
  // nothing extra - just reshaping data we already paid for.
  const historyByDate = body.data?.ebay?.priceHistory?.[key] ?? {};
  const history = Object.entries(historyByDate)
    .map(([date, day]) => ({ t: new Date(date).getTime(), p: day.average }))
    .sort((a, b) => a.t - b.t);

  return {
    price,
    saleCount: gradeData.count ?? null,
    lastSaleDate: gradeData.lastSaleDate ?? null,
    history,
  };
}

module.exports = { getGradedPrice };
