// TCGPlayer isn't scanned for deals (no open listings-search API for third
// parties) - this just builds a "check the price here too" affiliate link
// to their search results for a card, which still earns commission on
// purchases per the plan.
//
// TCGPlayer's affiliate program runs through impact.com. Once approved,
// they give you a link-building tool in the impact.com dashboard - the
// exact wrapping format can vary by account, so TCGPLAYER_AFFILIATE_ID is
// treated here as an Impact.com "deep link" tracking id that wraps a
// destination URL via a `u=` param, which is impact.com's standard pattern.
// Until that's set, this just returns a plain (non-affiliate) search link
// so the button still works.
function buildTcgplayerLink(cardName) {
  const destination = `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(
    cardName
  )}`;

  const affiliateId = process.env.TCGPLAYER_AFFILIATE_ID;
  if (!affiliateId) return destination;

  return `https://tcgplayer.pxf.io/c/${affiliateId}?u=${encodeURIComponent(destination)}`;
}

module.exports = { buildTcgplayerLink };
