// Currency display helpers. The site's five marketplaces each have one
// currency (see MARKETPLACES in lib/ebay.js). A deal row stores the
// listing's own currency in `currency`; when that's missing (older rows)
// it's derived from `marketplace`.

const MARKETPLACE_CURRENCY = {
  EBAY_US: "USD",
  EBAY_GB: "GBP",
  EBAY_AU: "AUD",
  EBAY_CA: "CAD",
  EBAY_DE: "EUR",
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

module.exports = { MARKETPLACE_CURRENCY, currencyForDeal, symbolFor, formatMoney };
