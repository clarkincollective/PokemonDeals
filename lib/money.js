// Currency display helpers. The site's six marketplaces each have one
// currency (see MARKETPLACES in lib/ebay.js). A deal row stores the
// listing's own currency in `currency`; when that's missing (older rows)
// it's derived from `marketplace`. EBAY_IT (added 2026-08-31) is EUR,
// already fully wired through lib/fx.js's NEEDED list and the SYMBOL map
// below - no other currency change was needed to add it.

const MARKETPLACE_CURRENCY = {
  EBAY_US: "USD",
  EBAY_GB: "GBP",
  EBAY_AU: "AUD",
  EBAY_CA: "CAD",
  EBAY_DE: "EUR",
  EBAY_IT: "EUR",
};

const SYMBOL = { USD: "$", GBP: "£", EUR: "€", AUD: "A$", CAD: "C$" };

function currencyForDeal(deal) {
  return deal?.currency || MARKETPLACE_CURRENCY[deal?.marketplace] || "USD";
}

function symbolFor(currency) {
  return SYMBOL[currency] || "$";
}

// "£2,950.00", "A$8.94", "$85.00"
function formatMoney(amount, currency) {
  const n = Number(amount);
  const [int, frac] = (Number.isFinite(n) ? n.toFixed(2) : "0.00").split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${symbolFor(currency)}${grouped}.${frac}`;
}

// Convert a USD amount into `currency` using a USD-base rate map (the one
// lib/fx.js's getUsdRates() returns: 1 USD = rates[C] units of C). Pure
// math with no network, so it's safe to call from client components too.
// Returns the amount unchanged for USD, a missing/zero rate, or a
// non-finite input.
function toViewerCurrency(usdAmount, currency, rates) {
  const n = Number(usdAmount);
  if (!Number.isFinite(n)) return 0;
  const r = rates && rates[currency];
  if (!currency || currency === "USD" || !Number.isFinite(r) || r <= 0) return n;
  return n * r;
}

// Works out how to show one deal's prices to a viewer whose local currency
// is `viewerCurrency`, using `rates` from lib/fx.js's getUsdRates().
//
// When the viewer's currency matches the deal's own (or FX data is
// missing) prices stay in the deal's currency untouched and `approx` is
// false. Otherwise every figure is converted from the deal's stored USD
// values into the viewer's currency and `approx` is true - eBay still
// charges in the listing's own currency at checkout, so a converted price
// is an estimate.
//
// Returns numbers (not formatted strings): `currency` to format them in,
// `approx`, and `listing` / `market` / `saved` amounts. `saved`/`market`
// are null when there's no usable market reference.
function viewerPricing(deal, viewerCurrency, rates) {
  const native = currencyForDeal(deal);
  const total = Number(deal.total_price);
  const totalUsd = Number(deal.total_price_usd != null ? deal.total_price_usd : deal.total_price);
  const marketUsd = Number(deal.market_price);
  const convert = Boolean(viewerCurrency) && viewerCurrency !== native && rates && rates[viewerCurrency] > 0;

  if (!convert) {
    // Legacy behaviour: only USD-native deals get absolute typical/save
    // figures, since market_price is a USD reference.
    const hasRef = native === "USD" && Number.isFinite(marketUsd);
    return {
      currency: native,
      approx: false,
      listing: total,
      market: hasRef ? marketUsd : null,
      saved: hasRef ? marketUsd - totalUsd : null,
    };
  }

  const listing = toViewerCurrency(totalUsd, viewerCurrency, rates);
  const market = Number.isFinite(marketUsd) ? toViewerCurrency(marketUsd, viewerCurrency, rates) : null;
  return {
    currency: viewerCurrency,
    approx: true,
    listing,
    market,
    saved: market != null ? market - listing : null,
  };
}

// The USD market reference expressed in a LISTING's own currency, so a
// comparison block ("A$120 · typical A$180 · Save A$60 · 33% below")
// stays single-currency on the server render and first paint - instead
// of "A$120 · typical $180". <Price> still localises BOTH figures to the
// viewer's currency together after hydration, always from their USD
// values, so this only fixes the pre-hydration / no-country / FX-down
// state.
//
// It uses the scan-time rate the listing itself implies
// (listingNative / listingUsd), NOT live FX - no network, and it can't
// disagree with how the listing price was converted. The savings
// PERCENTAGE is unchanged: both sides scale by the same rate.
//
// Returns the USD value unchanged for a USD listing. Returns null (caller
// shows the rate-invariant % with no dollar figure) when the scan-time
// rate can't be recovered - never a USD number mislabelled as A$/C$/etc.
function refInListingCurrency(marketUsd, listingNative, listingUsd, listingCurrency) {
  const m = Number(marketUsd);
  if (!Number.isFinite(m) || m <= 0) return null;
  if (!listingCurrency || listingCurrency === "USD") return m;
  const ln = Number(listingNative);
  const lu = Number(listingUsd);
  if (!(ln > 0) || !(lu > 0) || ln === lu) return null;
  return m * (ln / lu);
}

// A price is only worth rendering when it's a real, positive number.
// PokemonPriceTracker returns `0` (not null) for a card it has no pricing
// data for - a formatted "$0.00" reads to a visitor as a real price, so
// treat 0 / negatives / non-finite the same as "no price".
function hasPrice(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0;
}

module.exports = {
  MARKETPLACE_CURRENCY,
  currencyForDeal,
  symbolFor,
  formatMoney,
  toViewerCurrency,
  viewerPricing,
  refInListingCurrency,
  hasPrice,
};
