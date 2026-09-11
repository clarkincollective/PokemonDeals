import { getUsdRates } from "@/lib/fx";
import { viewerCurrency } from "@/lib/viewerCurrency";
import { detectedMarketplace, edgeCountry } from "@/lib/geo";

export const dynamic = "force-dynamic";

// The one request-time personalisation endpoint. Client components
// (CurrencyProvider, RegionRedirect, the saved / recently-viewed strips)
// read the viewer's currency + region + FX rates from here AFTER
// hydration, so the pages that show prices never read the geo header
// during render and stay statically cacheable. No secrets, no writes.
//   { viewer: "AUD", marketplace: "EBAY_AU", rates: { USD: 1, GBP: 0.79, ... } }
export async function GET() {
  const [viewer, marketplace, rates] = await Promise.all([
    viewerCurrency(),
    detectedMarketplace(),
    getUsdRates(),
  ]);
  // Phase 17C.0 - the coarse ISO-2 country the edge already reported for
  // this request (the same header viewerCurrency / detectedMarketplace
  // read above), so analytics can separate GEOGRAPHY from the shopping
  // marketplace. null when absent (local dev) or malformed - never guessed.
  // The response stays `private` (per-visitor), and the client never
  // persists this field.
  const geoCountry = await edgeCountry();
  return Response.json(
    { viewer, marketplace, rates, geo_country: geoCountry },
    { headers: { "Cache-Control": "private, max-age=900" } }
  );
}
