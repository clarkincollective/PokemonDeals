// USD-base FX rates for the currencies the site's marketplaces use, so a
// listing priced in GBP/AUD/CAD/EUR can be compared against the USD
// market price. Source: frankfurter.app (European Central Bank data, no
// key, generous limits). Cached in-module for 6h; a hardcoded fallback
// keeps the scanner working through an API outage (rates move slowly
// enough that a stale/approximate value is fine for a "% below market"
// signal, and the SANITY_FLOOR_PCT guard still applies).
//
// A rate R for currency C means: 1 USD = R units of C.
// So: usdAmount = localAmount / R.

const NEEDED = ["GBP", "EUR", "AUD", "CAD"];

// Rough long-run averages - only used if the fetch fails on a cold start.
const FALLBACK = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.52, CAD: 1.36 };

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cache = { rates: null, at: 0 };

async function getUsdRates() {
  if (cache.rates && Date.now() - cache.at < CACHE_TTL_MS) return cache.rates;
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${NEEDED.join(",")}`, {
      // don't let Next cache this at the fetch layer - we do our own
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const body = await res.json();
    const rates = { USD: 1 };
    for (const c of NEEDED) {
      const v = Number(body?.rates?.[c]);
      rates[c] = Number.isFinite(v) && v > 0 ? v : FALLBACK[c];
    }
    cache = { rates, at: Date.now() };
    return rates;
  } catch {
    // keep serving the last good rates if we have them, else the fallback
    return cache.rates ?? FALLBACK;
  }
}

// Convert a local-currency amount to USD using cached rates.
function toUsd(amount, currency, rates) {
  const r = rates?.[currency];
  if (!currency || currency === "USD" || !Number.isFinite(r) || r <= 0) return amount;
  return amount / r;
}

module.exports = { getUsdRates, toUsd, FX_FALLBACK: FALLBACK };
