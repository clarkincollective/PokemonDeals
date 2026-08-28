import { headers } from "next/headers";

// ISO-2 country -> the currency a visitor there should see prices in.
// Only the five the site has real market coverage for; anywhere else
// falls through to USD (the reference currency every price is stored in).
const COUNTRY_TO_CURRENCY = {
  US: "USD",
  GB: "GBP",
  AU: "AUD",
  CA: "CAD",
  DE: "EUR",
};

const KNOWN = new Set(["USD", "GBP", "AUD", "CAD", "EUR"]);

// The currency to DISPLAY prices in for this viewer. Decided by where they
// are (Vercel's `x-vercel-ip-country` geo header), NOT by which
// marketplace's listings they've filtered to - an Australian browsing
// US-shipped listings still wants to see A$. An optional `?ccy=` override
// (read from the already-awaited searchParams object, if passed) exists
// mainly for testing and for travellers / VPN users.
//
// Falls back to USD: local dev has no geo header, and a country with no
// local eBay marketplace has no obvious currency of its own to use. Every
// price on the site is stored with a USD value, so USD is always safe.
//
// NOTE: calling this opts a route into dynamic rendering (it reads
// headers()). That's already true of every page that shows a RegionRedirect
// / detectedMarketplace(); the detail and hub pages keep their heavy data
// in unstable_cache, so going dynamic only means the (cheap) HTML render
// runs per request, not that the DB / paid APIs get hit again.
export async function viewerCurrency(searchParams) {
  const raw = searchParams
    ? Array.isArray(searchParams.ccy)
      ? searchParams.ccy[0]
      : searchParams.ccy
    : null;
  const override = typeof raw === "string" ? raw.toUpperCase() : null;
  if (override && KNOWN.has(override)) return override;

  try {
    const country = (await headers()).get("x-vercel-ip-country");
    return (country && COUNTRY_TO_CURRENCY[country.toUpperCase()]) || "USD";
  } catch {
    return "USD";
  }
}
