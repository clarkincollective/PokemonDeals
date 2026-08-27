// TCGPlayer isn't scanned for deals (no open listings-search API for third
// parties) - this just builds a "check the price here too" affiliate link
// to their search results for a card, which still earns commission on
// purchases per the plan.
//
// TCGPlayer's affiliate program runs through impact.com. TCGPLAYER_AFFILIATE_LINK
// is the real tracking base link from the impact.com dashboard
// (https://partner.tcgplayer.com/c/<accountId>/<campaignId>/<adId>) -
// verified live that appending a destination URL via `u=` 301-redirects
// straight to that destination with the tracking params attached
// (irpid=<accountId>, campaign "Clarkin Collective"). Until that env var
// is set, this just returns a plain (non-affiliate) link so the button
// still works.
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

// tcgplayerId (when we have one) is TCGPlayer's own numeric product id -
// the same id JustTCG and PokemonPriceTracker both echo back and key
// their price lookups on (see lib/justtcg.js, lib/pokemonPriceTracker.js),
// confirmed against TCGPlayer's own image CDN URLs
// (tcgplayer-cdn.tcgplayer.com/product/<id>_...). tcgplayer.com/product/<id>
// resolves directly to that exact card's listing page - no slug needed,
// TCGPlayer's router only cares about the id - so this takes a visitor
// straight to the specific print instead of a name search that lands on
// every result for that Pokémon. Only falls back to the old
// search-by-name link when we don't have an id (shouldn't normally
// happen - every deal comes from a watchlist row that has one - but keeps
// the button working instead of breaking if it's ever missing).
function buildTcgplayerLink(cardName, tcgplayerId) {
  const destination = tcgplayerId
    ? `https://www.tcgplayer.com/product/${encodeURIComponent(tcgplayerId)}`
    : `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(
        cleanForTcgplayerSearch(cardName)
      )}`;

  const affiliateLink = process.env.TCGPLAYER_AFFILIATE_LINK;
  if (!affiliateLink) return destination;

  return `${affiliateLink}?u=${encodeURIComponent(destination)}`;
}

module.exports = { buildTcgplayerLink };
