// Pure, dependency-free eBay search-URL helpers shared by the server
// (lib/ebay buildEbaySearchLink) and the client (lib/useRegion). No
// React, no env, no fetch - safe in the browser bundle and in node --test.

// Consumer-facing eBay domain per scanned marketplace. The Pokemon
// singles category id is the same across all of them.
export const EBAY_DOMAIN = {
  EBAY_US: "www.ebay.com",
  EBAY_GB: "www.ebay.co.uk",
  EBAY_AU: "www.ebay.com.au",
  EBAY_CA: "www.ebay.ca",
  EBAY_DE: "www.ebay.de",
  EBAY_IT: "www.ebay.it",
};

// Re-point an already-built, campaign-wrapped eBay SEARCH url at the
// visitor's marketplace domain. ONLY the host changes - every tracking
// param (campid, mkevt, mkcid, mkrid, _sacat, _nkw, ...) is preserved, so
// the affiliate campaign is never lost. A non-eBay or unparseable url, or
// an unknown/empty region, is returned untouched.
export function localizeEbaySearchUrl(url, region) {
  const domain = EBAY_DOMAIN[region];
  if (!domain || typeof url !== "string") return url;
  try {
    const u = new URL(url);
    if (!/\.ebay\./.test(u.hostname)) return url;
    u.hostname = domain;
    return u.toString();
  } catch {
    return url;
  }
}
