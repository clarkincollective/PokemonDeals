import { headers } from "next/headers";

// ISO-2 country -> the eBay marketplace we scan for it. Only the six
// scanned marketplaces; every other country resolves to null and the
// visitor sees the unfiltered/global view until they pick a region.
const COUNTRY_TO_MARKETPLACE = {
  US: "EBAY_US",
  GB: "EBAY_GB",
  AU: "EBAY_AU",
  CA: "EBAY_CA",
  DE: "EBAY_DE",
  IT: "EBAY_IT",
};

// The visitor's likely eBay marketplace from Vercel's geo-IP header
// (x-vercel-ip-country - always present on Vercel, absent locally). This
// is only a DEFAULT: RegionRedirect uses it when the visitor hasn't made
// a choice, and any explicit ?country= or stored preference overrides it.
export async function detectedMarketplace() {
  try {
    const country = (await headers()).get("x-vercel-ip-country");
    if (!country) return null;
    return COUNTRY_TO_MARKETPLACE[country.toUpperCase()] ?? null;
  } catch {
    return null;
  }
}
