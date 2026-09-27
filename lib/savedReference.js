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
//   tcgcsv_ref:<tcgplayerId>:<language>            (added 2026-09-27)
//     { v, tcgplayerId, language, name, setName, cardNumber, retrievedAt,
//       source: "tcgcsv", printings: { [printingName]: { nm, market,
//       marketCondition: "Near Mint", low, mid, high, lastPriceUpdate } } }
//     TCGplayer's daily market price per printing, from tcgcsv.com (see
//     lib/tcgcsv.js for what it is and why it is Near Mint), written by the
//     nightly catalogue sync. Near Mint ONLY - it carries no ladder.
//
// MERGE (loadSavedMarketData -> mergeSavedRows). A card may hold both rows.
// They are combined CELL BY CELL, each cell keeping its own provider date:
// the Near Mint cell of a printing comes from the fresh row when it has one
// (with the fresh row's as-of), every other tier comes from the preserved
// ladder (with the ladder's as-of). So a Lightly Played comparison made
// today still says "as of 25 Sep 2026", and a Near Mint one says the date of
// the TCGplayer file it came from - neither date is borrowed from the other.
// The per-cell date travels as byConditionReference[tier].observedAt and
// byPrintingConditionAsOf[printing][tier]; the scanner writes THAT as
// reference_observed_at (falling back to the matrix-level lastUpdated only
// for a cell without one, which is the live path's shape).
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
const TCGCSV_REF_KIND_PREFIX = "tcgcsv_ref:";

const CONDITION_TIERS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
const TIER_FIELD = { "Near Mint": "nm", "Lightly Played": "lp", "Moderately Played": "mp", "Heavily Played": "hp", Damaged: "dmg" };

const savedRefKind = (tcgplayerId, language) => `${SAVED_REF_KIND_PREFIX}${String(tcgplayerId)}:${language || "english"}`;
const savedGradedKind = (tcgplayerId, language) => `${SAVED_GRADED_KIND_PREFIX}${String(tcgplayerId)}:${language || "english"}`;
const tcgcsvRefKind = (tcgplayerId, language) => `${TCGCSV_REF_KIND_PREFIX}${String(tcgplayerId)}:${language || "english"}`;

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
    // per-cell provider date: a merged row states one per tier; a plain
    // row's single lastPriceUpdate applies to every tier it carries
    const asOf = {};
    for (const tier of CONDITION_TIERS) asOf[tier] = p.asOfByTier?.[tier] ?? p.lastPriceUpdate ?? null;
    entries.push({
      printing,
      nm: usable(p.nm),
      price: usable(p.market),
      lp: usable(p.lp),
      mp: usable(p.mp),
      hp: usable(p.hp),
      dmg: usable(p.dmg),
      lastPriceUpdate: p.lastPriceUpdate ?? null,
      asOf,
    });
  }
  if (entries.length === 0) return null;

  const byPrintingCondition = {};
  const byPrintingConditionAsOf = {};
  for (const e of entries) {
    const tiers = {};
    const dates = {};
    for (const tier of CONDITION_TIERS) {
      const v = e[TIER_FIELD[tier]];
      if (v != null) {
        tiers[tier] = v;
        dates[tier] = e.asOf[tier] ?? null;
      }
    }
    if (Object.keys(tiers).length) {
      byPrintingCondition[e.printing] = tiers;
      byPrintingConditionAsOf[e.printing] = dates;
    }
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
        byConditionReference[tier] = { price: v, condition: tier, printing: e.printing, observedAt: e.asOf[tier] ?? null };
      }
    }
  }

  const picked = pickCatalogMarketReference(entries);
  const pickedEntry = picked?.price != null ? entries.find((e) => e.printing === picked.printing) : null;
  // the fallback's date is the date of the cell it was taken from
  const fallbackReference = picked?.price == null ? picked : { ...picked, observedAt: pickedEntry?.asOf?.["Near Mint"] ?? pickedEntry?.lastPriceUpdate ?? null };
  const fallbackPrice = fallbackReference?.price ?? null;

  if (Object.keys(byPrintingCondition).length === 0 && fallbackPrice == null) return null;

  return {
    byCondition,
    byConditionReference,
    byPrintingCondition,
    byPrintingConditionAsOf,
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
// Combine the preserved ladder row (saved_ref) with the fresh Near Mint
// row (tcgcsv_ref) for one card, cell by cell - see the header. Returns a
// row in the saved_ref shape whose printings carry `asOfByTier`. Either
// input may be null; both null -> null. Pure.
function mergeSavedRows(ladder, fresh) {
  if (!ladder && !fresh) return null;
  if (!fresh) return ladder;
  const base = ladder ?? {
    v: 1,
    tcgplayerId: fresh.tcgplayerId,
    language: fresh.language,
    name: fresh.name ?? null,
    setName: fresh.setName ?? null,
    retrievedAt: fresh.retrievedAt ?? null,
    source: fresh.source ?? null,
    printings: {},
  };
  const emptyAsOf = () => Object.fromEntries(CONDITION_TIERS.map((t) => [t, null]));
  const printings = {};
  for (const [name, p] of Object.entries(base.printings ?? {})) {
    if (!p || typeof p !== "object") continue;
    const asOfByTier = emptyAsOf();
    for (const t of CONDITION_TIERS) asOfByTier[t] = p.asOfByTier?.[t] ?? p.lastPriceUpdate ?? null;
    printings[name] = { ...p, asOfByTier };
  }
  for (const [name, f] of Object.entries(fresh.printings ?? {})) {
    if (!f || typeof f !== "object") continue;
    const nm = usable(f.nm ?? f.market);
    if (nm == null) continue; // a fresh row with nothing usable changes nothing
    const cur = printings[name] ?? { nm: null, lp: null, mp: null, hp: null, dmg: null, market: null, marketCondition: null, low: null, sellers: null, lastPriceUpdate: null, asOfByTier: emptyAsOf() };
    // A preserved played tier at or ABOVE today's Near Mint cannot be right
    // today (measured 27 Sep: Greninja ex 021/128 Near Mint 0.60 in the
    // fresh file, Lightly Played 0.75 in the 25 Sep ladder) - the market has
    // moved under it, and comparing a played listing to it would overstate
    // the saving. Fail closed: such tiers are dropped, never re-scaled. The
    // same rule the live path's ladderInverted guard applies to a figure
    // its own ladder contradicts.
    const merged = { ...cur, nm, market: nm, marketCondition: "Near Mint", low: f.low ?? cur.low ?? null, lastPriceUpdate: latestIso([cur.lastPriceUpdate, f.lastPriceUpdate]), asOfByTier: { ...cur.asOfByTier, "Near Mint": f.lastPriceUpdate ?? null }, freshFrom: f.source ?? fresh.source ?? "tcgcsv" };
    const dropped = [];
    for (const tier of CONDITION_TIERS) {
      if (tier === "Near Mint") continue;
      const field = TIER_FIELD[tier];
      const v = usable(merged[field]);
      if (v != null && v >= nm) {
        merged[field] = null;
        merged.asOfByTier[tier] = null;
        dropped.push(tier);
      }
    }
    if (dropped.length) merged.droppedAboveFreshNm = dropped;
    printings[name] = merged;
  }
  return { ...base, printings, merged: { ladder: Boolean(ladder), fresh: true } };
}

async function loadSavedMarketData(db, { tcgplayerId, language = "english" } = {}) {
  if (!db || tcgplayerId == null) return null;
  const lang = language || "english";
  try {
    const { data: rows } = await db
      .from("catalog_snapshot")
      .select("kind, data")
      .in("kind", [savedRefKind(tcgplayerId, lang), tcgcsvRefKind(tcgplayerId, lang)]);
    const ladder = (rows ?? []).find((r) => String(r.kind).startsWith(SAVED_REF_KIND_PREFIX))?.data ?? null;
    const fresh = (rows ?? []).find((r) => String(r.kind).startsWith(TCGCSV_REF_KIND_PREFIX))?.data ?? null;
    const merged = mergeSavedRows(ladder, fresh);
    if (merged) {
      const built = buildSavedMarketData(merged);
      if (built) return { ...built, savedFrom: ladder && fresh ? "saved_ref+tcgcsv_ref" : fresh ? "tcgcsv_ref" : "saved_ref" };
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
  // either family prices the card: the preserved ladder or the fresh row
  const keys = [...new Set(ids.flatMap((id) => [savedRefKind(id, language), tcgcsvRefKind(id, language)]))];
  for (let i = 0; i < keys.length; i += 200) {
    try {
      const { data } = await db.from("catalog_snapshot").select("kind").in("kind", keys.slice(i, i + 200));
      for (const r of data ?? []) {
        const id = String(r.kind).split(":")[1];
        if (id) out.add(id);
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
  TCGCSV_REF_KIND_PREFIX,
  tcgcsvRefKind,
  mergeSavedRows,
  SAVED_SOURCE,
  CONDITION_TIERS,
  savedRefKind,
  savedGradedKind,
  buildSavedMarketData,
  loadSavedMarketData,
  savedReferenceIds,
  loadSavedGradedPrice,
};
