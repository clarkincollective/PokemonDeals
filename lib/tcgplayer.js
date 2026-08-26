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
// Watchlist card names come from PokemonPriceTracker's own naming
// convention, which bakes in card-number/print-status metadata that never
// appears in TCGPlayer's actual product titles - e.g. "Rocket's Hitmonchan
// - 9 [Winner]", "Alolan Raichu - SM72 (Prerelease) (Staff)", "Charizard
// VMAX - 020/189". Searching TCGPlayer with that trailing text attached
// only hurts relevance (there's nothing on their side for it to match) and
// frequently returned zero results. Truncating at the first " - ", "(", or
// "[" keeps the actual card identity (name + EX/GX/VMAX/Star suffix, which
// TCGPlayer's real titles do include) and drops everything after it.
function cleanForTcgplayerSearch(cardName) {
  const cut = cardName.search(/ - |\(|\[/);
  const cleaned = cut === -1 ? cardName : cardName.slice(0, cut).trim();
  return cleaned.length >= 2 ? cleaned : cardName;
}

function buildTcgplayerLink(cardName) {
  const destination = `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(
    cleanForTcgplayerSearch(cardName)
  )}`;

  const affiliateId = process.env.TCGPLAYER_AFFILIATE_ID;
  if (!affiliateId) return destination;

  return `https://tcgplayer.pxf.io/c/${affiliateId}?u=${encodeURIComponent(destination)}`;
}

module.exports = { buildTcgplayerLink };
