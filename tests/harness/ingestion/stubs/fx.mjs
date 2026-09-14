const RATES = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.52, CAD: 1.36 };

export async function getUsdRates() {
  return RATES;
}

export function toUsd(amount, currency, rates) {
  const r = rates?.[currency];
  if (!currency || currency === "USD" || !Number.isFinite(r) || r <= 0) return amount;
  return amount / r;
}
