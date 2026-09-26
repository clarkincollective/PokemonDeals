// SAVED MARKET REFERENCES (2026-09-26) - the scanner's reference source when
// PokemonPriceTracker cannot be asked.
//
// The subscription stepped to the free tier (100 credits/day) on 26 Sep
// 2026. The scanner used to skip a card outright when the provider call
// failed, so discovery would have stopped. This module lets it price a
// listing from what we already hold, through the SAME shapes and the SAME
// downstream rules the live path uses - marketDataForListing,
// selectConditionPrice / selectConditionReference, referenceFor, and every
// trust gate in lib/dealQuality are untouched and cannot tell the
// difference except by the provenance they are handed.
//
// WHERE THE DATA LIVES. Two row families in the existing catalog_snapshot
// table (kind text primary key, data jsonb), written by
// scripts/preservation/importSavedReferences.mjs, so no schema change is
// needed to switch this on:
//
//   saved_ref:<tcgplayerId>:<language>
//     { v, tcgplayerId, language, retrievedAt, source, sourceSha256,
//       printings: { [printingName]: { nm, lp, mp, hp, dmg, market,
//                    marketCondition, low, sellers, lastPriceUpdate } } }
//     One entry per PRINTING, never collapsed - the same product id carries
//     e.g. "Holofoil" and "Reverse Holofoil" side by side, and the listing's
//     own evidence picks between them (lib/printingMatch), exactly as it
//     picks between the live response's variants.
//
//   saved_graded:<tcgplayerId>:<language>
//     { v, tcgplayerId, language, capturedAt, setName, cardName, rawNm,
//       salesByGrade: { [gradeKey]: { price, count, minPrice, maxPrice,
//                       lastSaleDate, providerLowConfidence } } }
//     The provider's own per-grade buckets, judged at scan time by the SAME
//     gradedTierConfidence gate the live path applies - so a bucket that
//     ages past that gate's 365-day rule declines, it is never relaxed.
//
// TWO TIMESTAMPS, kept apart on purpose (lib/referenceProvenance):
//   lastPriceUpdate  the PROVIDER's as-of for that printing's figures. This
//                    is what becomes reference_observed_at. It is the date
//                    the price was true, and it does not move when we
//                    re-read the row.
//   retrievedAt      when WE downloaded it. Recorded for debugging, never
//                    written as evidence, never used as an observation date.
// Nothing here writes a price_history row. Re-reading a saved figure is not
// a new observation of the market.
//
// IDENTITY IS EXACT. A row is keyed by product id AND language, a printing
// is matched by name, a condition by tier, a grade by grader+grade. Absent
// = absent: no printing is defaulted to, no tier is assumed Near Mint, and
// a raw figure is never handed to a graded listing.
//
// PROVENANCE: everything this module returns is `source: "card_catalog"`,
// a value the reference_source vocabulary already carries, so a stored
// comparison says truthfully where its figure came from.

const { isSentinelPrice, pickCatalogMarketReference, gradeKey } = require("./pokemonPriceTracker");
const { gradedTierConfidence } = require("./gradedConfidence");

const SAVED_REF_KIND_PREFIX = "saved_ref:";
const SAVED_GRADED_KIND_PREFIX = "saved_graded:";
const SAVED_SOURCE = "card_catalog";

const CONDITION_TIERS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
const TIER_FIELD = { "Near Mint": "nm", "Lightly Played": "lp", "Moderately Played": "mp", "Heavily Played": "hp", Damaged: "dmg" };

const savedRefKind = (tcgplayerId, language) => `${SAVED_REF_KIND_PREFIX}${String(tcgplayerId)}:${language || "english"}`;
const savedGradedKind = (tcgplayerId, language) => `${SAVED_GRADED_KIND_PREFIX}${String(tcgplayerId)}:${language || "english"}`;

// A usable price: finite, positive, not one of the provider's repdigit
// "no data" sentinels. Same filter every live builder applies.
function usable(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && !isSentinelPrice(n) ? n : null;
}

function latestIso(dates) {
  let best = null;
  for (const d of dates) {
    const t = Date.parse(d ?? "");
    if (Number.isFinite(t) && (best == null || t > best)) best = t;
  }
  return best == null ? null : new Date(best).toISOString();
}

// The provider-shaped market data for one saved_ref row. Returns null when
// nothing in the row can price anything.
//
// Mirrors lib/pokemonPriceTracker.getConditionPrices field for field:
//   byPrintingCondition  the UNCOLLAPSED matrix, one printing per key
//   byCondition          collapsed across printings, lowest wins per tier
//   byConditionReference the entry that produced each collapsed figure
//   fallbackPrice/Ref    pickCatalogMarketReference over the same entries -
//                        the SAME rule the nightly catalogue sync uses, so
//                        the sentinel filter, the Unlimited-over-1st-Edition
//                        preference and the inverted-ladder guard all apply
//   lastUpdated          the latest provider lastPriceUpdate among the
//                        printings that contributed
// The collapsed maps exclude 1st Edition printings whenever a non-1st
// printing is priced, which is the preference pickCatalogMarketReference
// encodes and the live builders' isFirstEdition exclusion approximates.
function buildSavedMarketData(data) {
  const printings = data?.printings && typeof data.printings === "object" ? data.printings : null;
  if (!printings) return null;

  const entries = [];
  for (const [printing, p] of Object.entries(printings)) {
    if (!printing || !p || typeof p !== "object") continue;
    entries.push({
      printing,
      nm: usable(p.nm),
      price: usable(p.market),
      lp: usable(p.lp),
      mp: usable(p.mp),
      hp: usable(p.hp),
      dmg: usable(p.dmg),
      lastPriceUpdate: p.lastPriceUpdate ?? null,
    });
  }
  if (entries.length === 0) return null;

  const byPrintingCondition = {};
  for (const e of entries) {
    const tiers = {};
    for (const tier of CONDITION_TIERS) {
      const v = e[TIER_FIELD[tier]];
      if (v != null) tiers[tier] = v;
    }
    if (Object.keys(tiers).length) byPrintingCondition[e.printing] = tiers;
  }

  const isFirstEd = (name) => /1st\s*edition/i.test(name ?? "");
  const hasNonFirst = entries.some((e) => !isFirstEd(e.printing) && (e.nm != null || e.price != null));
  const collapsedFrom = hasNonFirst ? entries.filter((e) => !isFirstEd(e.printing)) : entries;

  const byCondition = {};
  const byConditionReference = {};
  for (const e of collapsedFrom) {
    for (const tier of CONDITION_TIERS) {
      const v = e[TIER_FIELD[tier]];
      if (v == null) continue;
      if (byCondition[tier] == null || v < byCondition[tier]) {
        byCondition[tier] = v;
        // printing = the entry the figure came from, DIRECT - never inferred
        byConditionReference[tier] = { price: v, condition: tier, printing: e.printing };
      }
    }
  }

  const fallbackReference = pickCatalogMarketReference(entries);
  const fallbackPrice = fallbackReference?.price ?? null;

  if (Object.keys(byPrintingCondition).length === 0 && fallbackPrice == null) return null;

  return {
    byCondition,
    byConditionReference,
    byPrintingCondition,
    fallbackPrice,
    fallbackReference: fallbackPrice == null ? { price: null, condition: null, printing: null, exact: false } : fallbackReference,
    lastUpdated: latestIso(collapsedFrom.map((e) => e.lastPriceUpdate)),
    source: SAVED_SOURCE,
  };
}

// The scanner-facing loader. Reads the saved_ref row; when there is none,
// falls back to card_catalog's single labelled figure (English catalogue
// only - that table has no other language), as a ONE-CELL matrix keyed by
// the printing and condition the catalogue says the figure is for. An
// unlabelled catalogue figure (market_condition null) is offered only as
// the aggregate fallback, exactly as the live aggregate is, and the
// display gates then withhold any savings claim from it because its
// condition is not stated - the same outcome as today.
//
// `lastUpdated` for the card_catalog fallback is NULL: that table records
// only synced_at, our copy time, which is never an observation date
// (docs/preservation/ppt-pause-plan-2026-09-22.md §3 rule 1).
async function loadSavedMarketData(db, { tcgplayerId, language = "english" } = {}) {
  if (!db || tcgplayerId == null) return null;
  const lang = language || "english";
  try {
    const { data } = await db.from("catalog_snapshot").select("data").eq("kind", savedRefKind(tcgplayerId, lang)).maybeSingle();
    if (data?.data) {
      const built = buildSavedMarketData(data.data);
      if (built) return { ...built, savedFrom: "saved_ref" };
    }
  } catch {
    /* fall through to the catalogue */
  }
  if (lang !== "english") return null;
  try {
    const { data: c } = await db
      .from("card_catalog")
      .select("market_price, market_condition, market_printing")
      .eq("tcgplayer_id", String(tcgplayerId))
      .maybeSingle();
    const price = usable(c?.market_price);
    if (price == null) return null;
    const condition = CONDITION_TIERS.includes(c?.market_condition) ? c.market_condition : null;
    const printing = c?.market_printing ?? null;
    if (condition && printing) {
      const ref = { price, condition, printing };
      return {
        byCondition: { [condition]: price },
        byConditionReference: { [condition]: ref },
        byPrintingCondition: { [printing]: { [condition]: price } },
        fallbackPrice: null,
        fallbackReference: { price: null, condition: null, printing: null, exact: false },
        lastUpdated: null,
        source: SAVED_SOURCE,
        savedFrom: "card_catalog",
      };
    }
    return {
      byCondition: {},
      byConditionReference: {},
      byPrintingCondition: {},
      fallbackPrice: price,
      fallbackReference: { price, condition: null, printing, exact: false },
      lastUpdated: null,
      source: SAVED_SOURCE,
      savedFrom: "card_catalog",
    };
  } catch {
    return null;
  }
}

// Which of these product ids have a saved_ref row for the language. Used to
// spend the allocated scan budget on cards that can actually be priced
// while the provider is unavailable. Batched; never throws.
async function savedReferenceIds(db, ids, language = "english") {
  const out = new Set();
  if (!db || !ids?.length) return out;
  const keys = [...new Set(ids.map((id) => savedRefKind(id, language)))];
  for (let i = 0; i < keys.length; i += 200) {
    try {
      const { data } = await db.from("catalog_snapshot").select("kind").in("kind", keys.slice(i, i + 200));
      for (const r of data ?? []) {
        const id = String(r.kind).slice(SAVED_REF_KIND_PREFIX.length).split(":")[0];
        out.add(id);
      }
    } catch {
      /* partial answer is still an answer */
    }
  }
  return out;
}

// Saved graded reference for an EXACT grader+grade, judged by the same
// confidence gate as the live lookup (lib/pokemonPriceTracker.getGradedPrice
// lines 662-688). Returns null - the scanner then publishes no graded
// comparison - whenever the bucket is missing, has no price, or the gate
// says "low". A raw figure is never returned for a slab.
async function loadSavedGradedPrice(db, { tcgplayerId, language = "english", grader, grade } = {}) {
  const key = gradeKey(grader, grade);
  if (!db || tcgplayerId == null || !key) return null;
  let data;
  try {
    ({ data } = await db.from("catalog_snapshot").select("data").eq("kind", savedGradedKind(tcgplayerId, language || "english")).maybeSingle());
  } catch {
    return null;
  }
  const saved = data?.data;
  const bucket = saved?.salesByGrade?.[key];
  const price = usable(bucket?.price);
  if (!bucket || price == null) return null;
  const siblingPrices = Object.entries(saved.salesByGrade)
    .filter(([k, s]) => k !== "ungraded" && k !== key && Number(s?.count) > 0)
    .map(([, s]) => usable(s.price))
    .filter((p) => p != null);
  const conf = gradedTierConfidence(
    {
      key,
      currentPrice: price,
      minPrice: bucket.minPrice ?? null,
      maxPrice: bucket.maxPrice ?? null,
      saleCount: bucket.count ?? 0,
      lastSaleDate: bucket.lastSaleDate ?? null,
      providerLowConfidence: Boolean(bucket.providerLowConfidence),
    },
    { rawNm: usable(saved.rawNm), setName: saved.setName, cardName: saved.cardName, siblingPrices }
  );
  if (conf.level === "low") return null;
  return {
    price,
    saleCount: bucket.count ?? null,
    lastSaleDate: bucket.lastSaleDate ?? null,
    confidence: conf.level,
    source: SAVED_SOURCE,
  };
}

module.exports = {
  SAVED_REF_KIND_PREFIX,
  SAVED_GRADED_KIND_PREFIX,
  SAVED_SOURCE,
  CONDITION_TIERS,
  savedRefKind,
  savedGradedKind,
  buildSavedMarketData,
  loadSavedMarketData,
  savedReferenceIds,
  loadSavedGradedPrice,
};
