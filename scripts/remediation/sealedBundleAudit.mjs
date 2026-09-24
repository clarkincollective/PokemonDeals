// sealed-bundle-coverage-2026-09-24 - STAGE 2 PHASE A + B + C.
// READ-ONLY. Audits every Booster Bundle catalogue product, maps the 84
// unresolved booster-bundle rows onto candidate destinations, and quantifies
// the operational cost of watching them.
//
//   node scripts/remediation/sealedBundleAudit.mjs --out=<file>
//
// SELECT only. No update/insert/upsert/delete/rpc anywhere in this file.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { sealedListingDecision, sealedNameMatch } from "../../lib/sealedProductMatch.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const { listingMatchesSealedProduct } = require(join(REPO, "lib", "dealMatching.js"));
const { CONSUMER_GROUP_CAPS, PACE_BURST } = require(join(REPO, "lib", "browseBudget.js"));

export const FROZEN = join(REPO, ".local", "remediation", "sealed-unresolved-frozen-2026-09-24.json");
export const SOURCE_REFUSAL = "kind_mismatch:booster_bundle_vs_booster_box";
// A catalogue product is a Booster Bundle when its own product_type or name
// says so - read from the catalogue, never inferred from a listing title.
//
// FIGURE CORRECTION. The accepted read-only report said "71 Booster Bundle
// products exist in sealed_catalog". That count matched on name+set only.
// The catalogue's OWN classification is product_type, and matching
// name+product_type gives 171. The two reconcile exactly:
//   171 = 71 products whose NAME says "Booster Bundle"
//       + 100 whose name does not but whose product_type does
// and those 100 are a different product class - "Sleeved Booster Pack
// Bundle [Set of 8]", "Booster Pack Art Bundle [Set of 4]" - multi-pack
// variants, not the modern single Booster Bundle SKU the 84 rows describe.
// They are classified separately below rather than counted as eligible.
export const BUNDLE_RE = /booster bundle/i;
// Multi-pack / art / sleeved variants: a different SKU class.
export const VARIANT_RE = /\[set of|sleeved|art bundle|pack bundle/i;

const productOf = (p) => (p?.name ? { name: p.name, set: p.set ?? null, productType: null } : null);

export function acceptingProducts(title, products) {
  const out = [];
  for (const p of products) {
    const prod = productOf(p);
    if (!prod) continue;
    const nm = sealedNameMatch({ title }, { name: p.name, set: p.set }, listingMatchesSealedProduct);
    if (!nm.ok) continue;
    const d = sealedListingDecision(title ?? "", prod);
    if (!d.ok) continue;
    out.push({ id: p.id ?? null, tcgplayerId: p.tcgplayer_id, name: p.name, set: p.set, viaAlias: nm.viaAlias, watched: p.__watched === true });
  }
  return out;
}

const page = async (db, table, select, tweak, order = "id") => {
  const out = [];
  for (let f = 0; ; f += 1000) {
    let q = db.from(table).select(select).order(order).range(f, f + 999);
    if (tweak) q = tweak(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
};

export async function audit(db) {
  const frozen = JSON.parse(readFileSync(FROZEN, "utf8"));
  const cohortIds = frozen.cohort.filter((e) => e.refusal === SOURCE_REFUSAL).map((e) => e.dealId);

  const watched = await page(db, "sealed_watchlist", "id,name,set,tcgplayer_id,active,source");
  const activeWatched = watched.filter((w) => w.active === true).map((w) => ({ ...w, __watched: true }));
  const watchedByTcg = new Map(watched.map((w) => [String(w.tcgplayer_id), w]));

  const catalogue = await page(db, "sealed_catalog", "tcgplayer_id,name,set,product_type,language,market_price,synced_at", null, "tcgplayer_id");
  const bundles = catalogue.filter((c) => BUNDLE_RE.test(`${c.name ?? ""} ${c.product_type ?? ""}`));

  // the live rows for this stage's cohort
  const rows = [];
  for (let i = 0; i < cohortIds.length; i += 200) {
    const { data, error } = await db
      .from("sealed_deals")
      .select("id,title,marketplace,listing_id,is_active,disqualified_reason,total_price_usd,sealed_watchlist_id, sealed_watchlist:sealed_watchlist_id (id,name,set,tcgplayer_id)")
      .in("id", cohortIds.slice(i, i + 200));
    if (error) throw new Error(`sealed_deals: ${error.message}`);
    rows.push(...(data ?? []));
  }

  // --- PHASE B: map every cohort row ------------------------------------
  const bundleCandidates = bundles.map((b) => ({ ...b, id: watchedByTcg.get(String(b.tcgplayer_id))?.id ?? null, __watched: false }));
  const rowMap = [];
  for (const r of rows) {
    const byBundle = acceptingProducts(r.title, bundleCandidates);
    const byWatched = acceptingProducts(r.title, activeWatched);
    let verdict;
    if (byWatched.length > 0) verdict = "accepted_by_an_existing_watched_product";
    else if (byBundle.length === 1) verdict = "exactly_one_bundle_destination";
    else if (byBundle.length > 1) verdict = "multiple_bundle_destinations";
    else verdict = "no_valid_bundle_destination";
    rowMap.push({
      dealId: r.id,
      title: r.title,
      marketplace: r.marketplace,
      ebayListingId: r.listing_id,
      currentProductId: r.sealed_watchlist_id,
      currentProductName: r.sealed_watchlist?.name ?? null,
      verdict,
      bundleDestinations: byBundle,
      existingWatchedAcceptors: byWatched,
    });
  }

  // --- PHASE A: classify every bundle product ---------------------------
  const rowsByTcg = new Map();
  for (const m of rowMap) for (const d of m.bundleDestinations) {
    if (!rowsByTcg.has(String(d.tcgplayerId))) rowsByTcg.set(String(d.tcgplayerId), []);
    rowsByTcg.get(String(d.tcgplayerId)).push(m);
  }
  const nameKey = (b) => `${String(b.name ?? "").trim().toLowerCase()}|${String(b.set ?? "").trim().toLowerCase()}`;
  const dupGroups = new Map();
  for (const b of bundles) {
    const k = nameKey(b);
    if (!dupGroups.has(k)) dupGroups.set(k, []);
    dupGroups.get(k).push(b);
  }

  const classified = bundles.map((b) => {
    const tcg = String(b.tcgplayer_id);
    const matching = rowsByTcg.get(tcg) ?? [];
    const mkt = {};
    for (const m of matching) mkt[m.marketplace] = (mkt[m.marketplace] ?? 0) + 1;
    const wl = watchedByTcg.get(tcg) ?? null;
    const dupe = (dupGroups.get(nameKey(b)) ?? []).length > 1;
    // Would any row this product would own ALSO be accepted by a product
    // that is already watched? That is duplicate-ownership competition.
    const contested = matching.filter((m) => m.existingWatchedAcceptors.length > 0).length;
    let group;
    if (typeof b.market_price !== "number" || !(b.market_price > 0)) group = "4_not_suitable_no_reference";
    else if (dupe) group = "3_duplicate_or_alias_catalogue_entry";
    else if (String(b.language ?? "English").toLowerCase() !== "english") group = "4_not_suitable_non_english";
    else if (contested > 0) group = "5_ambiguous_manual_review";
    else if (matching.length > 0) group = "1_needed_for_current_unresolved_rows";
    // A multi-pack / art / sleeved variant is a different SKU class from the
    // single Booster Bundle these rows describe; not eligible on this stage.
    else if (VARIANT_RE.test(String(b.name ?? ""))) group = "3_different_sku_class_pack_art_sleeved_variant";
    else group = "2_legitimate_no_current_rows";
    return {
      tcgplayerId: b.tcgplayer_id,
      name: b.name,
      set: b.set,
      productType: b.product_type,
      language: b.language ?? null,
      catalogueReference: b.market_price ?? null,
      catalogueSyncedAt: b.synced_at ?? null,
      currentlyWatched: Boolean(wl),
      watchlistId: wl?.id ?? null,
      watchlistActive: wl?.active ?? null,
      matchingUnresolvedRows: matching.length,
      matchingRowIds: matching.map((m) => m.dealId),
      marketplaceDistribution: mkt,
      alsoAcceptedByAWatchedProduct: contested,
      duplicateCatalogueName: dupe,
      // Every watched product costs ONE Browse call per marketplace per run
      // (app/api/refresh-sealed-deals: scanProductInMarketplace is called once
      // per marketplace for each product), so a new product is exactly one new
      // scheduled search per scoped run.
      newSearchQueriesPerScopedRun: 1,
      group,
    };
  });

  // --- PHASE C: operational impact --------------------------------------
  const currentActive = activeWatched.length;
  const eligible = classified.filter((c) => c.group === "1_needed_for_current_unresolved_rows" || c.group === "2_legitimate_no_current_rows");
  const cap = CONSUMER_GROUP_CAPS.sealed;
  const cost = (n) => ({
    watchedProducts: n,
    browseCallsPerScopedRun: n, // 1 marketplace per cron invocation
    dailyCap: cap,
    burstCap: PACE_BURST.sealed,
    headroom: cap - n,
    withinCap: n <= cap,
    // acquireBrowseLease grants at least ceil(requested/4) when short
    minGrantIfShort: Math.ceil(n / 4),
    coverageIfCapped: Math.min(1, cap / n),
  });

  return {
    readAt: new Date().toISOString(),
    frozenReadAt: frozen.readAt,
    cohort: { refusal: SOURCE_REFUSAL, ids: cohortIds, count: cohortIds.length, liveRowsFound: rows.length },
    catalogue: { total: catalogue.length, boosterBundles: bundles.length },
    watchlist: { total: watched.length, active: currentActive, bundlesAlreadyWatched: classified.filter((c) => c.currentlyWatched).length },
    products: classified,
    rowMap,
    workload: {
      model: "one eBay Browse call per watched product per marketplace per run; the cron scopes to ?country=EBAY_US so a run is 1 call per active product",
      current: cost(currentActive),
      ifCanary3: cost(currentActive + 3),
      ifAllEligible: cost(currentActive + eligible.length),
      ifAll71: cost(currentActive + classified.length),
      ifNeededOnly: cost(currentActive + classified.filter((c) => c.group === "1_needed_for_current_unresolved_rows").length),
      eligibleCount: eligible.length,
      neededCount: classified.filter((c) => c.group === "1_needed_for_current_unresolved_rows").length,
      // THE DECISIVE OPERATIONAL FACT. The scheduled cron scans ONE
      // marketplace (?country=EBAY_US, 07:20 daily). None of this cohort is
      // in it, so watching a product cannot re-home any of these rows on the
      // current schedule, whatever the budget allows.
      scheduledMarketplaces: ["EBAY_US"],
      cohortMarketplaces: rowMap.reduce((a2, m) => ((a2[m.marketplace] = (a2[m.marketplace] ?? 0) + 1), a2), {}),
      cohortRowsInScheduledMarketplace: rowMap.filter((m) => m.marketplace === "EBAY_US").length,
      costToScanNeededInAllSixMarketplaces: (currentActive + classified.filter((c) => c.group === "1_needed_for_current_unresolved_rows").length) * 6,
    },
  };
}

async function main() {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
  for (const line of readFileSync(join(REPO, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const a = await audit(db);

  console.log(`frozen ${a.frozenReadAt}   read ${a.readAt}`);
  console.log(`cohort (${a.cohort.refusal}): ${a.cohort.count}  live rows found ${a.cohort.liveRowsFound}`);
  console.log(`sealed_catalog rows ${a.catalogue.total}; Booster Bundle products ${a.catalogue.boosterBundles}`);
  console.log(`sealed_watchlist ${a.watchlist.total} (${a.watchlist.active} active); bundles already watched ${a.watchlist.bundlesAlreadyWatched}`);

  console.log(`\n=== PHASE A: the ${a.products.length} Booster Bundle products, by group ===`);
  const g = {};
  for (const p of a.products) (g[p.group] ??= []).push(p);
  for (const [k, v] of Object.entries(g).sort()) console.log(`  ${String(v.length).padStart(4)}  ${k}`);

  console.log(`\n=== PHASE B: the ${a.rowMap.length} cohort rows, by verdict ===`);
  const v = {};
  for (const m of a.rowMap) (v[m.verdict] ??= []).push(m.dealId);
  for (const [k, ids] of Object.entries(v).sort((x, y) => y[1].length - x[1].length)) console.log(`  ${String(ids.length).padStart(4)}  ${k}`);

  console.log(`\n=== PHASE C: operational impact (sealed browse budget) ===`);
  const w = a.workload;
  console.log(`  model: ${w.model}`);
  console.log(`  scheduled marketplaces : ${w.scheduledMarketplaces.join(",")}`);
  console.log(`  cohort marketplaces    : ${JSON.stringify(w.cohortMarketplaces)}`);
  console.log(`  cohort rows in the scheduled marketplace: ${w.cohortRowsInScheduledMarketplace} of ${a.rowMap.length}  <- BLOCKER`);
  console.log(`  needed products scanned in ALL 6 marketplaces: ${w.costToScanNeededInAllSixMarketplaces} calls vs cap ${w.current.dailyCap}`);
  for (const [k, c] of [["current", w.current], ["+3 canary", w.ifCanary3], [`+needed only (${w.neededCount})`, w.ifNeededOnly], [`+all eligible (${w.eligibleCount})`, w.ifAllEligible], [`+all ${a.catalogue.boosterBundles}`, w.ifAll71]]) {
    console.log(
      `  ${k.padEnd(22)} products ${String(c.watchedProducts).padStart(4)}  calls/run ${String(c.browseCallsPerScopedRun).padStart(4)}  cap ${c.dailyCap}  headroom ${String(c.headroom).padStart(4)}  withinCap=${c.withinCap}  coverageIfCapped=${(c.coverageIfCapped * 100).toFixed(0)}%`
    );
  }

  console.log(`\n=== products needed for current unresolved rows ===`);
  for (const p of (g["1_needed_for_current_unresolved_rows"] ?? []).sort((x, y) => y.matchingUnresolvedRows - x.matchingUnresolvedRows)) {
    console.log(`  ${String(p.matchingUnresolvedRows).padStart(3)} rows  ${p.tcgplayerId}  ${p.name} | ${p.set}  ref=${p.catalogueReference}  markets=${JSON.stringify(p.marketplaceDistribution)}`);
  }
  for (const key of ["5_ambiguous_manual_review", "3_duplicate_or_alias_catalogue_entry", "4_not_suitable_no_reference", "4_not_suitable_non_english"]) {
    const list = g[key] ?? [];
    if (!list.length) continue;
    console.log(`\n=== ${key} (${list.length}) ===`);
    for (const p of list.slice(0, 12)) console.log(`  ${p.tcgplayerId}  ${p.name} | ${p.set}  rows=${p.matchingUnresolvedRows} contested=${p.alsoAcceptedByAWatchedProduct} ref=${p.catalogueReference} lang=${p.language}`);
    if (list.length > 12) console.log(`  … ${list.length - 12} more`);
  }

  const out = arg("out");
  if (out) {
    if (existsSync(out)) throw new Error(`${out} exists; refusing to overwrite an audit artefact`);
    writeFileSync(out, JSON.stringify(a, null, 1));
    console.log(`\naudit -> ${out}`);
  }
  console.log("\nREAD-ONLY: no row was updated, inserted or deleted.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
