import { slugifySet } from "@/lib/slugify";
import { extractSpecies } from "@/lib/pokemonSpecies";
import { CARD_HUB_MIN_LISTINGS, SPECIES_MIN_LISTINGS } from "@/lib/indexability";

// The exact grouping logic that fetchSets / fetchCardHubs / fetchSpeciesHubs
// used to run inline, extracted so it can be computed once by
// /api/refresh-catalog and stored in the catalog_snapshot table, and
// reused as the live fallback when that table is missing/stale.
//
// `rows` is every active deal row for one language, each shaped:
//   { total_price, image_url, watchlist: { id, name, set, language, justtcg_tcgplayer_id } }
export function computeAggregates(rows) {
  // --- sets: count per set name ---
  const setCounts = new Map();
  for (const row of rows) {
    const set = row.watchlist?.set;
    if (!set) continue;
    setCounts.set(set, (setCounts.get(set) ?? 0) + 1);
  }
  const sets = Array.from(setCounts.entries())
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
      if (Number(row.total_price) < existing.cheapestPrice) {
        existing.cheapestPrice = Number(row.total_price);
        existing.image = row.image_url;
      }
    } else {
      byCard.set(w.id, {
        id: w.id,
        name: w.name,
        set: w.set,
        tcgplayerId: w.justtcg_tcgplayer_id,
        count: 1,
        cheapestPrice: Number(row.total_price),
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
    const price = Number(row.total_price);
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
    let slug = slugifySet(g.name);
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
