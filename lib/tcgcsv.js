// TCGCSV (2026-09-27) - TCGplayer's daily catalogue prices, as published by
// https://tcgcsv.com (a free, keyless mirror of TCGplayer's product and
// pricing API, refreshed once a day at about 20:00 UTC).
//
// WHY. PokemonPriceTracker is on the free tier (100 credits a day, no bulk
// export), so the nightly catalogue sync had nothing to sync. TCGCSV keys
// every row on the SAME TCGplayer product id the site stores as
// tcgplayer_id / justtcg_tcgplayer_id, for both Pokemon (category 3) and
// Pokemon Japan (category 85). Measured 26 Sep 2026, one paced pass of
// every group: 30,682 English and 21,340 Japanese products with a market
// price; 5,199 of 5,352 English watchlist ids (97.1%) and 2,527 of 3,466
// Japanese (72.9%) priced.
//
// WHAT A ROW IS. One (productId, subTypeName) pair per line, subTypeName
// being the printing ("Normal", "Holofoil", "Reverse Holofoil", ...), with
// lowPrice / midPrice / highPrice / marketPrice / directLowPrice. No
// per-condition ladder: TCGCSV states it "does not share information about
// SKUs", so there is exactly one market figure per printing.
//
// WHICH CONDITION marketPrice IS. Treated as Near Mint, on this evidence,
// recorded here so it can be re-checked: (a) TCGplayer computes Market
// Price per condition and the product-level figure is the Near Mint one;
// (b) the previous provider's export carried the same TCGplayer market
// column labelled "Near Mint" on 400 of 400 rows sampled; (c) across 1,444
// printings compared on 26 Sep, TCGCSV marketPrice / that provider's Near
// Mint figure had a median ratio of 1.000 (52% within 5%, 84% within 15%,
// two days apart) and a median ratio of 1.074 against the Lightly Played
// figure. So each row is emitted with marketNearMint = marketPrice and
// marketPriceCondition "Near Mint", in the export row shape the catalogue
// sync already consumes; the sync's own pickCatalogMarketReference then
// labels the record's provenance from that field exactly as before.
//
// WHAT IS EXCLUDED FROM THE SINGLES PASS. The eleven WOTC dual-printing sets
// (1st Edition and Unlimited share one TCGCSV product and one blended
// price, as they did in the previous export) are skipped entirely: their
// existing references stay as they are rather than being replaced by a
// blend. Sealed products are skipped FROM THE CARD ROWS: the card
// catalogue is singles. A single is a product carrying any CARD attribute
// (Number, Rarity, Card Type, HP, Stage, an Attack) - measured 26 Sep: 455
// priced Japanese watchlist singles (unnumbered promos, energies, DP-era
// sets) carry Rarity / HP / Attacks but no Number, so "has a Number" alone
// had dropped them. A sealed product carries none of these.
//
// SEALED PRODUCTS (added 28 Sep 2026, owner: "I'm not upgrading pokemon
// price tracker... find ways we can keep the market data updated. using
// free sources"). The same per-group /products + /prices pass that builds
// the card rows already DOWNLOADS every sealed product too - TCGCSV mirrors
// TCGplayer's whole catalogue per category, not singles only - and the
// previous version of this module just discarded them (`sealedSkipped`).
// `fetchTcgcsvCatalogue` now also returns `sealedRows`, built from exactly
// those discarded products, at no extra HTTP request: sealed_catalog.
// market_price (app/api/sync-sealed-catalog) no longer needs
// PokemonPriceTracker's listSealedProductsForSet at all. Boxed/case/bundle
// product-level pricing on TCGplayer typically has thinner liquidity than
// a single card, so this carries the same caveats pokemonpricetracker's
// sealed prices always did (lib/sealedCatalog.flagImplausibleSealedPrices
// still runs over these rows unchanged).
//
// DATES. Every row's lastPriceUpdate is the Last-Modified header of the
// price file it came from (measured: "Sat, 26 Sep 2026 20:02:58 GMT") - the
// publisher's own time, never ours. `asOf` is the latest of those.
//
// COURTESY. One request at a time, PACE_MS apart, an identifying
// User-Agent. TCGCSV publishes no rate limit; its FAQ's example sleeps
// 0.25 s between requests and that is what this does.
const { WOTC_DUAL_PRINTING_SETS } = require("./pokemonPriceTracker");
const { isSentinelPrice } = require("./pokemonPriceTracker");
const { sealedProductType } = require("./sealedCatalog");
const { catalogImageUrl, upgradeCatalogImage } = require("./cardImage");

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const TCGCSV_SOURCE = "tcgcsv";
const TCGCSV_CATEGORY = Object.freeze({ english: 3, japanese: 85 });
const TCGCSV_REF_KIND_PREFIX = "tcgcsv_ref:";
const USER_AGENT = "pokemondealfinder.com catalogue sync (https://pokemondealfinder.com)";
const PACE_MS = 250;
const REF_UPSERT_CHUNK = 200;

const tcgcsvRefKind = (tcgplayerId, language) => `${TCGCSV_REF_KIND_PREFIX}${String(tcgplayerId)}:${language || "english"}`;

function isWotcDualPrintingGroup(name) {
  return WOTC_DUAL_PRINTING_SETS.has(String(name ?? "").trim());
}

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isoFromHttpDate(v) {
  const t = Date.parse(v ?? "");
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// GET one TCGCSV JSON document. Returns { results, lastModified } where
// lastModified is the publisher's Last-Modified header as ISO (null when
// absent). Throws on a non-2xx status or a malformed body.
async function tcgcsvGet(path, { fetchImpl = fetch } = {}) {
  const url = `${TCGCSV_BASE}/${path}`;
  const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`TCGCSV request failed: ${res.status} ${url}`);
  const body = await res.json();
  if (!body || !Array.isArray(body.results)) throw new Error(`TCGCSV unexpected shape: ${url}`);
  return { results: body.results, lastModified: isoFromHttpDate(res.headers?.get?.("last-modified")) };
}

function extended(product, name) {
  const hit = (product?.extendedData ?? []).find((e) => e?.name === name);
  const v = hit?.value;
  return v == null || String(v).trim() === "" ? null : String(v).trim();
}

// Attributes only a CARD carries (TCGplayer's own extendedData names, both
// spellings seen: "Card Type" in English, "CardType" in Japanese groups).
const CARD_ATTRIBUTES = ["Number", "Rarity", "Card Type", "CardType", "HP", "Stage", "Attack 1", "Attack 2", "Weakness", "Resistance", "Retreat Cost", "RetreatCost"];
function isSingleCard(product) {
  return (product?.extendedData ?? []).some((e) => CARD_ATTRIBUTES.includes(e?.name) && e?.value != null && String(e.value).trim() !== "");
}

// The whole priced single-card catalogue for one language, as export-shaped
// rows (the shape app/api/sync-card-catalog already merges per card):
//   { tcgPlayerId, name, setName, setId, cardNumber, rarity, language,
//     printing, marketPrice, lowPrice, midPrice, highPrice, directLowPrice,
//     marketNearMint, marketPriceCondition, lastPriceUpdate }
// `sealedRows` (same pass, no extra requests) is the sealed_catalog-shaped
// twin: one row per non-single product with a usable price, { tcgPlayerId,
// name, setName, setId, language, unopenedPrice, imageUrl, lastPriceUpdate }
// - see buildSealedCatalogRows for the sealed_catalog record it becomes.
// Options: fetchImpl (tests), pace (ms between requests), onProgress(info),
// groupLimit (tests / a bounded pass).
async function fetchTcgcsvCatalogue({ language = "english", fetchImpl = fetch, pace = PACE_MS, onProgress = null, groupLimit = null } = {}) {
  const category = TCGCSV_CATEGORY[language];
  if (!category) throw new Error(`TCGCSV: no category for language "${language}"`);
  const stats = { language, category, requests: 0, groups: 0, groupsPriced: 0, skippedWotcGroups: [], singles: 0, sealedSkipped: 0, sealedRows: 0, sealedPriced: 0, priceRows: 0, rows: 0, failures: [] };

  const groupsDoc = await tcgcsvGet(`${category}/groups`, { fetchImpl });
  stats.requests++;
  let groups = groupsDoc.results.filter((g) => g && g.groupId != null);
  stats.groups = groups.length;
  if (groupLimit) groups = groups.slice(0, groupLimit);

  const rows = [];
  const sealedRows = [];
  let asOf = null;
  for (const g of groups) {
    const setName = String(g.name ?? "").trim();
    // the 1st Edition / Unlimited blend is an ENGLISH WOTC matter; a Japanese
    // set that happens to share a name ("Gym Challenge") is a different product
    if (language === "english" && isWotcDualPrintingGroup(setName)) {
      stats.skippedWotcGroups.push(setName);
      continue;
    }
    let products;
    let prices;
    try {
      await sleep(pace);
      products = await tcgcsvGet(`${category}/${g.groupId}/products`, { fetchImpl });
      stats.requests++;
      await sleep(pace);
      prices = await tcgcsvGet(`${category}/${g.groupId}/prices`, { fetchImpl });
      stats.requests++;
    } catch (err) {
      stats.failures.push(`${g.groupId} ${setName}: ${err.message}`);
      continue;
    }
    const singles = new Map();
    // sealed_catalog.sealedProductType order-of-match encodes TCGplayer's
    // own compound-category names ("Elite Trainer Box" before "Box"); this
    // reuses that exact rule so a product lands in the SAME type a visitor
    // already sees on /sealed-deals, whichever sync wrote it.
    const sealedProducts = new Map();
    for (const p of products.results) {
      if (isSingleCard(p)) {
        singles.set(String(p.productId), { name: String(p.name ?? p.cleanName ?? "").trim(), cardNumber: extended(p, "Number"), rarity: extended(p, "Rarity") });
      } else {
        stats.sealedSkipped++;
        sealedProducts.set(String(p.productId), { name: String(p.name ?? p.cleanName ?? "").trim(), imageUrl: p.imageUrl ?? null });
      }
    }
    stats.singles += singles.size;
    const fileAsOf = prices.lastModified;
    if (fileAsOf && (asOf == null || fileAsOf > asOf)) asOf = fileAsOf;
    let priced = 0;
    const sealedPricedThisGroup = new Set();
    for (const r of prices.results) {
      stats.priceRows++;
      const id = r?.productId != null ? String(r.productId) : null;
      const single = id ? singles.get(id) : null;
      if (single) {
        const market = num(r.marketPrice);
        const printing = String(r.subTypeName ?? "").trim();
        if (printing) {
          rows.push({
            tcgPlayerId: id,
            name: single.name,
            setName,
            setId: String(g.groupId),
            cardNumber: single.cardNumber,
            rarity: single.rarity,
            language,
            printing,
            marketPrice: market,
            lowPrice: num(r.lowPrice),
            midPrice: num(r.midPrice),
            highPrice: num(r.highPrice),
            directLowPrice: num(r.directLowPrice),
            // see the header: TCGplayer's product-level market price is the Near
            // Mint figure, and the previous export labelled this same column so
            marketNearMint: market,
            marketPriceCondition: market == null ? null : "Near Mint",
            lastPriceUpdate: fileAsOf,
          });
          if (market != null) priced++;
        }
        continue;
      }
      const sealed = id ? sealedProducts.get(id) : null;
      if (!sealed) continue;
      // Sealed TCGCSV rows carry no subTypeName worth keying on (unlike a
      // card's printings) - one price row per product id is what the feed
      // sends, so the first one with a usable market price wins.
      if (sealedPricedThisGroup.has(id)) continue;
      const market = num(r.marketPrice);
      sealedRows.push({
        tcgPlayerId: id,
        name: sealed.name,
        setName,
        setId: String(g.groupId),
        language,
        imageUrl: sealed.imageUrl,
        unopenedPrice: market,
        lastPriceUpdate: fileAsOf,
      });
      stats.sealedRows++;
      if (market != null) {
        stats.sealedPriced++;
        sealedPricedThisGroup.add(id);
      }
    }
    if (priced) stats.groupsPriced++;
    if (onProgress) onProgress({ group: setName, groupId: g.groupId, priced, requests: stats.requests });
  }
  stats.rows = rows.length;
  return { rows, sealedRows, asOf, stats };
}

// The rows lib/savedReference reads as the FRESH source: one
// catalog_snapshot row per card + language, kind tcgcsv_ref:<id>:<lang>,
// every printing kept as its own entry, Near Mint only, with the file's
// own as-of. Same field names as the preserved saved_ref rows, so the
// resolver merges them cell by cell.
function buildTcgcsvRefRows(rows, { retrievedAt = new Date().toISOString() } = {}) {
  const byCard = new Map();
  for (const r of rows ?? []) {
    if (!r?.tcgPlayerId || !r.printing || r.marketPrice == null) continue;
    const lang = r.language || "english";
    const key = `${r.tcgPlayerId}|${lang}`;
    const row = byCard.get(key) ?? {
      v: 1,
      tcgplayerId: String(r.tcgPlayerId),
      language: lang,
      name: r.name ?? null,
      setName: r.setName ?? null,
      cardNumber: r.cardNumber ?? null,
      retrievedAt,
      source: TCGCSV_SOURCE,
      printings: {},
    };
    row.printings[r.printing] = {
      nm: r.marketPrice,
      lp: null,
      mp: null,
      hp: null,
      dmg: null,
      market: r.marketPrice,
      marketCondition: "Near Mint",
      low: r.lowPrice ?? null,
      mid: r.midPrice ?? null,
      high: r.highPrice ?? null,
      lastPriceUpdate: r.lastPriceUpdate ?? null,
    };
    byCard.set(key, row);
  }
  const updated_at = new Date().toISOString();
  return [...byCard.values()].map((data) => ({ kind: tcgcsvRefKind(data.tcgplayerId, data.language), data, updated_at }));
}

// sealedRows -> sealed_catalog records, in sealedCatalogRecord's exact
// shape (same columns `app/api/sync-sealed-catalog` has always upserted),
// so `source` is the only thing a reader can tell changed. Deduped by
// product id (a product can only live in one TCGCSV group). The implausible-
// box-price guard (lib/sealedCatalog.flagImplausibleSealedPrices) is NOT
// run here - the caller runs it over the full record set, same as before.
function buildSealedCatalogRows(sealedRows, { language = "english" } = {}) {
  const byId = new Map();
  for (const r of sealedRows ?? []) {
    if (!r?.tcgPlayerId) continue;
    const price = num(r.unopenedPrice);
    byId.set(r.tcgPlayerId, {
      tcgplayer_id: r.tcgPlayerId,
      name: r.name ?? "",
      set: r.setName ?? "",
      set_id: r.setId ?? null,
      product_type: sealedProductType(r.name),
      language: r.language || language,
      market_price: price != null && !isSentinelPrice(price) ? price : null,
      image_url: upgradeCatalogImage(r.imageUrl) || catalogImageUrl(r.tcgPlayerId),
      source: TCGCSV_SOURCE,
      synced_at: new Date().toISOString(),
    });
  }
  return [...byId.values()];
}

// Upsert the ref rows in chunks. Never throws; reports errors.
async function writeTcgcsvRefs(db, refRows) {
  let written = 0;
  const errors = [];
  for (let i = 0; i < refRows.length; i += REF_UPSERT_CHUNK) {
    const slice = refRows.slice(i, i + REF_UPSERT_CHUNK);
    try {
      const { error } = await db.from("catalog_snapshot").upsert(slice, { onConflict: "kind" });
      if (error) errors.push(error.message);
      else written += slice.length;
    } catch (e) {
      errors.push(e?.message ?? String(e));
    }
  }
  return { written, errors };
}

module.exports = {
  TCGCSV_BASE,
  TCGCSV_SOURCE,
  TCGCSV_CATEGORY,
  TCGCSV_REF_KIND_PREFIX,
  PACE_MS,
  tcgcsvRefKind,
  isWotcDualPrintingGroup,
  isSingleCard,
  tcgcsvGet,
  fetchTcgcsvCatalogue,
  buildTcgcsvRefRows,
  buildSealedCatalogRows,
  writeTcgcsvRefs,
};
