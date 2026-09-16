import { slugifySet } from "@/lib/slugify";
import { extractSpecies, speciesSlug } from "@/lib/pokemonSpecies";
import { CARD_HUB_MIN_LISTINGS, SET_MIN_LISTINGS, SPECIES_MIN_LISTINGS } from "@/lib/indexability";
import { isOfferCountable } from "@/lib/dealQuality";

// The exact grouping logic that fetchSets / fetchCardHubs / fetchSpeciesHubs
// used to run inline, extracted so it can be computed once by
// /api/refresh-catalog and stored in the catalog_snapshot table, and
// reused as the live fallback when that table is missing/stale.
//
// `rows` is every active deal row for one language, each shaped:
//   { total_price, total_price_usd, image_url,
//     watchlist: { id, name, set, language, justtcg_tcgplayer_id } }
//
// Prices are aggregated in USD (total_price_usd) so a hub's "from $X" and
// a species' price range are consistent across listings priced in
// different marketplace currencies. Fall back to total_price for rows
// not yet backfilled.
const usdPrice = (row) => Number(row.total_price_usd ?? row.total_price);

export function computeAggregates(rows) {
  // reader-consistency: these counts and "from $X" figures advertise
  // available offers, so a held row or a blocking visual verdict never feeds
  // them either (lib/dealQuality.isOfferCountable), re-sighted or not.
  //
  // SEO-4 (16 Sep 2026) - membership is DECOUPLED from savingsClaimTrusted.
  //
  // This filter used to be `isOfferCountable(row) && savingsClaimTrusted(row)`
  // (17C.7), which made "does this set have a hub?" depend on whether its
  // listings could evidence a DISCOUNT. Those are different questions, and
  // conflating them meant tightening the savings rule silently deleted
  // pages: simulated over live data, requiring evidence everywhere would
  // have taken set hubs 89 -> 49, species 64 -> 20 and card hubs 248 -> 69,
  // 404ing five card hubs outright - while the listings themselves were
  // still on the site the whole time.
  //
  // Nothing here is a savings claim. `count` is how many offers we hold
  // for the set / card / species, and `cheapestPrice` is the lowest asking
  // price among them: both are facts about listings, true whether or not a
  // reference can be evidenced. The savings claim itself is still gated,
  // at the point it is rendered (lib/deals.js passes discountPct as null
  // for an untrusted row, so it shows as a plain listing).
  //
  // The reader-facing copy matches: these badges say "N listings", not
  // "N deals" (components/SetsFilterList.js, components/PokemonFilterList.js).
  rows = (rows ?? []).filter((row) => isOfferCountable(row));
  // --- sets: count per set name ---
  const setCounts = new Map();
  for (const row of rows) {
    const set = row.watchlist?.set;
    if (!set) continue;
    setCounts.set(set, (setCounts.get(set) ?? 0) + 1);
  }
  const sets = Array.from(setCounts.entries())
    .filter(([, count]) => count >= SET_MIN_LISTINGS) // thin-content rule - see lib/indexability.js
    .map(([set, count]) => ({ set, slug: slugifySet(set), count }))
    .sort((a, b) => b.count - a.count);

  // --- card hubs: group by watched card, keep those with 2+ active ---
  const byCard = new Map();
  for (const row of rows) {
    const w = row.watchlist;
    if (!w) continue;
    const existing = byCard.get(w.id);
    if (existing) {
      existing.count++;
      if (usdPrice(row) < existing.cheapestPrice) {
        existing.cheapestPrice = usdPrice(row);
        existing.image = row.image_url;
      }
    } else {
      byCard.set(w.id, {
        id: w.id,
        name: w.name,
        set: w.set,
        tcgplayerId: w.justtcg_tcgplayer_id,
        count: 1,
        cheapestPrice: usdPrice(row),
        image: row.image_url,
      });
    }
  }
  const seenHubSlugs = new Set();
  const cardHubs = [];
  for (const w of byCard.values()) {
    if (w.count < CARD_HUB_MIN_LISTINGS) continue; // indexability rule - see lib/indexability.js
    let slug = `${slugifySet(w.name)}-${slugifySet(w.set)}`;
    if (seenHubSlugs.has(slug)) slug = `${slug}-${w.id}`;
    seenHubSlugs.add(slug);
    cardHubs.push({ ...w, slug });
  }
  cardHubs.sort((a, b) => b.count - a.count);

  // --- species hubs: group by canonical species, keep those over the
  //     thin-content threshold ---
  const bySpecies = new Map();
  for (const row of rows) {
    const w = row.watchlist;
    if (!w) continue;
    const name = extractSpecies(w.name);
    if (!name) continue;
    const price = usdPrice(row);
    const existing = bySpecies.get(name);
    if (existing) {
      existing.count++;
      existing.sets.add(w.set);
      existing.watchlistIds.add(w.id);
      if (Number.isFinite(price)) {
        if (price < existing.minPrice) {
          existing.minPrice = price;
          existing.image = row.image_url;
        }
        if (price > existing.maxPrice) existing.maxPrice = price;
      }
    } else {
      bySpecies.set(name, {
        name,
        count: 1,
        sets: new Set([w.set]),
        watchlistIds: new Set([w.id]),
        minPrice: Number.isFinite(price) ? price : Infinity,
        maxPrice: Number.isFinite(price) ? price : 0,
        image: row.image_url,
      });
    }
  }
  const seenSpeciesSlugs = new Set();
  const speciesHubs = [];
  for (const g of bySpecies.values()) {
    if (g.count < SPECIES_MIN_LISTINGS) continue;
    // speciesSlug() == slugifySet() for every species except the Nidoran
    // pair (explicit -f / -m), so a deal-having species and its no-deal
    // catalog fallback resolve to the same /pokemon/<slug>.
    let slug = speciesSlug(g.name);
    if (!slug) continue;
    if (seenSpeciesSlugs.has(slug)) slug = `${slug}-${speciesHubs.length}`;
    seenSpeciesSlugs.add(slug);
    speciesHubs.push({
      name: g.name,
      slug,
      count: g.count,
      setCount: g.sets.size,
      printCount: g.watchlistIds.size,
      watchlistIds: [...g.watchlistIds],
      image: g.image ?? null,
      minPrice: g.minPrice === Infinity ? null : g.minPrice,
      maxPrice: g.maxPrice || null,
    });
  }
  speciesHubs.sort((a, b) => b.count - a.count);

  return { sets, cardHubs, speciesHubs };
}
