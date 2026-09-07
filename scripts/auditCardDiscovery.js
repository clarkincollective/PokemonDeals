// node scripts/auditCardDiscovery.js
// SEO Phase 4B - card discovery graph audit (uncommitted, one-off).
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ---- mirror lib/cardSlug.js predicates (dependency-free copies) ----
const SLUG = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const SENTINEL = new Set([999, 999.99, 9999, 9999.99, 99999, 99999.99]);
const priceOk = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && !SENTINEL.has(n);
};
const NOT_A_CARD =
  /\b(code card|booster (pack|bundle|box)|elite trainer box|build & battle|collection box|premium collection|digital bundle|surprise box|mystery box|mini tin|poke ?ball tin|master ?ball tin|blister|tin|pack|box|case|gift set|collector chest|decks?|sleeves?|playmat|deck box)\b/i;
const isRealCardName = (n) => typeof n === "string" && n.length > 0 && !NOT_A_CARD.test(n);
const resolvable = (r) => Boolean(r && isRealCardName(r.name) && r.image_url && r.tcgplayer_id != null);
const indexable = (r) => resolvable(r) && priceOk(r.market_price);
const cardSlug = (name, set) => `${SLUG(name)}-${SLUG(set)}`;

const { extractSpecies, speciesSlug } = require("../lib/pokemonSpecies");
const { isEligibleSpeciesCard } = require("../lib/speciesHub");

const SET_MIN_LISTINGS = 3;
const SET_CATALOG_MIN_CARDS = 10;
const SPECIES_MIN_LISTINGS = 5;
const SPECIES_CATALOG_MIN_CARDS = 6;
const CARD_HUB_MIN_LISTINGS = 2;
const SET_CATALOG_MAX_BROWSE = 600;

async function allRows(table, select, filter) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(select).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

(async () => {
  console.log("Loading card_catalog (english)...");
  const cat = await allRows(
    "card_catalog",
    "tcgplayer_id, name, set, card_number, rarity, card_type, species, market_price, image_url",
    (q) => q.eq("language", "english")
  );
  console.log(`  ${cat.length} english card_catalog rows`);

  // active deal aggregates
  console.log("Loading active english deals...");
  const deals = await allRows(
    "deals",
    "watchlist_id, watchlist:watchlist_id!inner (id, name, set, language)",
    (q) => q.eq("is_active", true).eq("watchlist.language", "english")
  );
  const dealByCard = new Map(); // watchlist_id -> {name,set,count}
  const dealSetCounts = new Map();
  const dealSpeciesCounts = new Map();
  for (const d of deals) {
    const w = d.watchlist;
    if (!w) continue;
    const c = dealByCard.get(w.id) ?? { name: w.name, set: w.set, count: 0 };
    c.count++;
    dealByCard.set(w.id, c);
    dealSetCounts.set(w.set, (dealSetCounts.get(w.set) ?? 0) + 1);
    const sp = extractSpecies(w.name);
    if (sp) dealSpeciesCounts.set(sp, (dealSpeciesCounts.get(sp) ?? 0) + 1);
  }
  const cardHubSlugs = new Set();
  for (const [, c] of dealByCard) if (c.count >= CARD_HUB_MIN_LISTINGS) cardHubSlugs.add(cardSlug(c.name, c.set));
  console.log(`  ${deals.length} active deal rows, ${dealByCard.size} distinct watched cards, ${cardHubSlugs.size} deal-backed card hubs (>=2)`);

  // ---- resolvable / indexable catalogue slugs ----
  const resolvableSlugs = new Set();
  const indexableSlugs = new Set();
  for (const r of cat) {
    if (!resolvable(r)) continue;
    const s = cardSlug(r.name, r.set);
    resolvableSlugs.add(s);
    if (indexable(r)) indexableSlugs.add(s);
  }

  // ---- indexable set hubs (deal >=3 OR catalogue >=10 eligible) ----
  const catSetEligible = new Map();
  for (const r of cat) if (indexable(r)) catSetEligible.set(r.set, (catSetEligible.get(r.set) ?? 0) + 1);
  const indexableSetNames = new Set();
  for (const [set, n] of dealSetCounts) if (n >= SET_MIN_LISTINGS) indexableSetNames.add(set);
  for (const [set, n] of catSetEligible) if (n >= SET_CATALOG_MIN_CARDS) indexableSetNames.add(set);

  // ---- indexable species hubs (deal >=5 OR catalogue >=6 eligible) ----
  const catSpeciesEligible = new Map();
  for (const r of cat) {
    if (!r.species || !priceOk(r.market_price) || !r.image_url) continue;
    if (!isEligibleSpeciesCard({ name: r.name, card_type: r.card_type }, r.species)) continue;
    catSpeciesEligible.set(r.species, (catSpeciesEligible.get(r.species) ?? 0) + 1);
  }
  const indexableSpecies = new Set();
  for (const [sp, n] of dealSpeciesCounts) if (n >= SPECIES_MIN_LISTINGS) indexableSpecies.add(sp);
  for (const [sp, n] of catSpeciesEligible) if (n >= SPECIES_CATALOG_MIN_CARDS) indexableSpecies.add(sp);

  // ---- per-card inbound-link classification (indexable cards only) ----
  // Pokemon-linked: canonical species leads the card name, that species has
  //   an indexable /pokemon hub, and the card is isEligibleSpeciesCard.
  // Set-linked: the card's set has an indexable /sets hub AND the card is
  //   within that set page's rendered checklist (browse cap 600 for huge sets).
  const bySetIndexableCards = new Map(); // set -> array of {slug, priced}
  for (const r of cat) {
    if (!resolvable(r)) continue;
    if (!bySetIndexableCards.has(r.set)) bySetIndexableCards.set(r.set, []);
    bySetIndexableCards.get(r.set).push(r);
  }
  // deterministic card-number order like fetchSetCatalog, to model the 600 cap
  const numOf = (s) => {
    const m = String(s ?? "").match(/\d+/);
    return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
  };
  const setRenderedSlugs = new Set(); // slugs that appear as a link on their set page
  for (const [set, rows] of bySetIndexableCards) {
    if (!indexableSetNames.has(set)) continue;
    rows.sort((a, b) => numOf(a.card_number) - numOf(b.card_number));
    const rendered = rows.slice(0, Math.max(SET_CATALOG_MAX_BROWSE, rows.length <= SET_CATALOG_MAX_BROWSE ? rows.length : SET_CATALOG_MAX_BROWSE));
    // NB: deal-backed cards in the set are always rendered; approximate by
    // taking first 600 + any with a live deal
    const dealSlugs = new Set([...dealByCard.values()].filter((c) => c.set === set).map((c) => cardSlug(c.name, c.set)));
    for (const r of rows) {
      const s = cardSlug(r.name, r.set);
      if (rows.length <= SET_CATALOG_MAX_BROWSE || rendered.includes(r) || dealSlugs.has(s)) setRenderedSlugs.add(s);
    }
  }

  let pokemonLinked = 0;
  let setLinked = 0;
  let both = 0;
  let neither = 0;
  const neitherBuckets = { trainerEnergy: 0, belowThresholdSet: 0, noSpeciesHub: 0, specialty: 0, other: 0 };
  const SPECIALTY_SETS = new Set(["Jumbo Cards", "World Championship Decks"]);

  for (const r of cat) {
    if (!indexable(r)) continue; // classify indexable cards only
    const sp = extractSpecies(r.name);
    const spOk =
      sp &&
      isEligibleSpeciesCard({ name: r.name, card_type: r.card_type }, sp) &&
      indexableSpecies.has(sp);
    const setOk = setRenderedSlugs.has(cardSlug(r.name, r.set));
    if (spOk) pokemonLinked++;
    if (setOk) setLinked++;
    if (spOk && setOk) both++;
    if (!spOk && !setOk) {
      neither++;
      const ct = String(r.card_type ?? "").toLowerCase();
      if (ct && !/pok[eé]mon/.test(ct)) neitherBuckets.trainerEnergy++;
      else if (!sp) neitherBuckets.trainerEnergy++;
      else if (!indexableSetNames.has(r.set) && !indexableSpecies.has(sp)) neitherBuckets.belowThresholdSet++;
      else if (sp && !indexableSpecies.has(sp)) neitherBuckets.noSpeciesHub++;
      else if (SPECIALTY_SETS.has(r.set)) neitherBuckets.specialty++;
      else neitherBuckets.other++;
    }
  }

  // ---- SEO Phase 4B new inbound surfaces ----
  // (a) /cards directory: 24 featured (highest market ref, standard first)
  //     + browse chips (link /pokemon and /sets, not individual cards).
  const featSeen = new Set();
  const featRows = [];
  for (const r of [...cat].filter((x) => indexable(x)).sort((a, b) => Number(b.market_price) - Number(a.market_price))) {
    const sl = cardSlug(r.name, r.set);
    if (featSeen.has(sl)) continue;
    featSeen.add(sl);
    featRows.push(r);
  }
  featRows.sort((a, b) => (SPECIALTY_SETS.has(a.set) ? 2 : 1) - (SPECIALTY_SETS.has(b.set) ? 2 : 1));
  const dirLinked = new Set(featRows.slice(0, 24).map((r) => cardSlug(r.name, r.set)));

  // (b) RelatedCards on every indexable card page: top-8 by market ref in
  //     the same set + top-8 in the same species (standard before
  //     specialty). A card is "related-linked" if it lands in some other
  //     card's top-8 for its set or species.
  const bySetAll = new Map();
  const bySpeciesAll = new Map();
  for (const r of cat) {
    if (!indexable(r)) continue;
    if (!bySetAll.has(r.set)) bySetAll.set(r.set, []);
    bySetAll.get(r.set).push(r);
    const sp = extractSpecies(r.name);
    if (sp && isEligibleSpeciesCard({ name: r.name, card_type: r.card_type }, sp)) {
      if (!bySpeciesAll.has(sp)) bySpeciesAll.set(sp, []);
      bySpeciesAll.get(sp).push(r);
    }
  }
  const relatedLinked = new Set();
  const topN = (rows) =>
    [...rows]
      .sort((a, b) => Number(b.market_price) - Number(a.market_price))
      .sort((a, b) => (SPECIALTY_SETS.has(a.set) ? 2 : 1) - (SPECIALTY_SETS.has(b.set) ? 2 : 1))
      .slice(0, 8);
  for (const rows of bySetAll.values()) for (const r of topN(rows)) relatedLinked.add(cardSlug(r.name, r.set));
  for (const rows of bySpeciesAll.values()) for (const r of topN(rows)) relatedLinked.add(cardSlug(r.name, r.set));

  const totalIndexable = indexableSlugs.size;
  const catalogueOnlyIndexable = [...indexableSlugs].filter((s) => !cardHubSlugs.has(s)).length;

  console.log("\n================ CARD DISCOVERY AUDIT ================");
  console.log(`total english card_catalog rows          : ${cat.length}`);
  console.log(`distinct resolvable permanent card slugs : ${resolvableSlugs.size}`);
  console.log(`distinct indexable /cards/[slug]         : ${indexableSlugs.size}`);
  console.log(`distinct noindex /cards/[slug] (resolv.) : ${resolvableSlugs.size - indexableSlugs.size}`);
  console.log(`deal-backed card hubs (>=2 listings)     : ${cardHubSlugs.size}`);
  console.log(`  of which also in indexable catalogue   : ${[...cardHubSlugs].filter((s) => indexableSlugs.has(s)).length}`);
  console.log(`catalogue-only indexable card pages      : ${catalogueOnlyIndexable}`);
  console.log(`estimated cards.xml <loc> (hub ∪ cat-ix) : ${new Set([...cardHubSlugs, ...indexableSlugs]).size}`);
  console.log(`\nindexable set hubs (deal>=3 OR cat>=10)  : ${indexableSetNames.size}`);
  console.log(`indexable species hubs (deal>=5 OR cat>=6): ${indexableSpecies.size}`);
  console.log(`\n--- inbound HTML links (indexable cards, n=${totalIndexable}) ---`);
  console.log(`linked from >=1 Pokemon hub page         : ${pokemonLinked}`);
  console.log(`linked from >=1 set hub page             : ${setLinked}`);
  console.log(`linked from BOTH                         : ${both}`);
  console.log(`linked from NEITHER (sitemap/search only): ${neither}`);
  console.log(`  breakdown:`, JSON.stringify(neitherBuckets));
  console.log(`\nreconcile: pokemonOnly ${pokemonLinked - both} + setOnly ${setLinked - both} + both ${both} + neither ${neither} = ${pokemonLinked - both + (setLinked - both) + both + neither} (should equal ${totalIndexable})`);

  // ---- Phase 4B AFTER: fold in the /cards directory + RelatedCards ----
  let neither4b = 0;
  let neither4bStrict = 0; // still no Pokemon/set/directory link (excludes RelatedCards)
  const residualBuckets = { trainerEnergy: 0, specialty: 0, other: 0 };
  for (const r of cat) {
    if (!indexable(r)) continue;
    const s = cardSlug(r.name, r.set);
    const sp = extractSpecies(r.name);
    const spOk = sp && isEligibleSpeciesCard({ name: r.name, card_type: r.card_type }, sp) && indexableSpecies.has(sp);
    const setOk = setRenderedSlugs.has(s);
    const dirOk = dirLinked.has(s);
    const relOk = relatedLinked.has(s);
    if (!spOk && !setOk && !dirOk) {
      neither4bStrict++;
      if (!relOk) {
        neither4b++;
        const ct = String(r.card_type ?? "").toLowerCase();
        if ((ct && !/pok[eé]mon/.test(ct)) || !sp) residualBuckets.trainerEnergy++;
        else if (SPECIALTY_SETS.has(r.set)) residualBuckets.specialty++;
        else residualBuckets.other++;
      }
    }
  }
  console.log(`\n--- Phase 4B AFTER ---`);
  console.log(`/cards directory featured cards          : ${dirLinked.size}`);
  console.log(`cards reachable via a RelatedCards top-8 : ${relatedLinked.size}`);
  console.log(`still no Pokemon/set/directory link      : ${neither4bStrict}`);
  console.log(`  ...and not in any RelatedCards list     : ${neither4b}`);
  console.log(`  residual breakdown:`, JSON.stringify(residualBuckets));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
