// PAUSE SAFETY (22 Sep 2026) - the invariants that decide whether the
// PokemonPriceTracker subscription can be paused without losing or
// corrupting what we have already retrieved.
//
// Every one of these held when it was traced by hand, and every one of
// them held only by CONVENTION: nothing stopped a future edit from
// quietly breaking it, and the breakage would be silent - a route that
// writes a year of flat prices, or a reference that claims to have been
// observed on the day it was merely read again, looks exactly like
// working code. The plan that depends on them is
// docs/preservation/ppt-pause-plan-2026-09-22.md.
//
// Source-level assertions on purpose. The failure mode being guarded is
// "someone moved the call / removed the gate", which is a fact about the
// code, not about one run of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const catalogSync = read("app/api/sync-card-catalog/route.js");
const provenance = read("lib/referenceProvenance.js");
const lastmodSql = read("supabase/card_reference_lastmod_migration.sql");

test("a frozen catalogue can never be written back as a day of price history", () => {
  // snapshotCatalogHistory copies card_catalog -> price_history with
  // observed_on = today. That is correct ONLY as the tail of a run that
  // just refreshed those prices from the provider. If the provider call
  // fails (a paused key, an outage) the route must return BEFORE it,
  // otherwise re-reading unchanged stored values manufactures history -
  // and price_history is the single asset no future sync could rebuild.
  const exportIdx = catalogSync.indexOf("await downloadPrintingsExport()");
  const bailIdx = catalogSync.indexOf('stage: "export"');
  const snapIdx = catalogSync.indexOf("await snapshotCatalogHistory(");
  assert.ok(exportIdx > 0, "the provider export call is still here");
  assert.ok(bailIdx > exportIdx, "its failure still returns early");
  assert.ok(snapIdx > bailIdx, "the snapshot still sits AFTER that bail-out");

  // and the snapshot's own source is our table, so it must never be
  // reachable on a provider failure by some other route.
  assert.equal(
    catalogSync.split("snapshotCatalogHistory(").length - 1,
    2, // the definition and the single call site
    "snapshotCatalogHistory gained a second call site - re-check that it too sits behind the export bail-out"
  );
});

test("the catalogue sync's cache expiry cannot clear a stored price", () => {
  // The one function that runs on the write path and touches nothing but
  // caches. If it ever gained an update/delete it would silently empty
  // the references a paused site still needs to render.
  const fn = catalogSync.slice(
    catalogSync.indexOf("const expireCatalogPrices"),
    catalogSync.indexOf("const expireCatalogPrices") + 400
  );
  assert.match(fn, /if \(!\(rowsWritten > 0\) \|\| invalidated\) return;/, "still gated on rows actually written");
  assert.match(fn, /revalidateTag\(CATALOG_PRICES_TAG/, "still only a cache tag");
  assert.doesNotMatch(fn, /\.update\(|\.delete\(|\.upsert\(/, "cache expiry must not write to the database");
});

test("no sync route deletes or truncates stored pricing data", () => {
  for (const route of [
    "app/api/sync-card-catalog/route.js",
    "app/api/sync-sealed-catalog/route.js",
    "app/api/sync-watchlist/route.js",
  ]) {
    const src = read(route);
    assert.doesNotMatch(src, /\.delete\(\)/, `${route}: no delete path`);
    assert.doesNotMatch(src, /truncate/i, `${route}: no truncate`);
  }
});

test("our copy time is never promoted to the provider's observation time", () => {
  // reference_observed_at certifies WHEN A PRICE WAS TRUE and is the only
  // column postReleaseReference will accept. reference_synced_at is when
  // WE copied it. Reading a stored value again updates the second and
  // must never touch the first - that is precisely what a saved-data mode
  // would be tempted to do.
  assert.match(provenance, /reference_observed_at/, "the provider as-of column is still declared");
  assert.match(provenance, /NEVER\s*(?:\r?\n\/\/)?\s*read as evidence of when the price was true/i);
  // The builders must accept the two timestamps as separate arguments,
  // never derive one from the other.
  assert.doesNotMatch(
    provenance,
    /reference_observed_at:\s*(?:syncedAt|new Date\(\)|Date\.now\(\))/,
    "observed_at must never be filled from our sync time or the clock"
  );
  assert.match(provenance, /reference_synced_at: syncedAt \?\? null,/);
});

test("the sitemap's proof-of-change evidence does not expire, so a pause cannot shrink it", () => {
  // card_reference_lastmod() feeds the substance gate. An upper bound on
  // observed_on is a sanity check; a LOWER bound would turn every banked
  // price change into a rolling window that empties while the provider is
  // paused, silently de-advertising thousands of real pages.
  assert.match(lastmodSql, /ph\.observed_on <= current_date \+ 1/, "upper bound still present");
  assert.doesNotMatch(
    lastmodSql,
    /observed_on\s*>=?\s*(?:current_date|now\(\))/,
    "a lower bound would make banked price-change evidence expire"
  );
});

test("every render path survives the provider being unavailable", () => {
  // A paused key throws at fetchPPT. These are the surfaces a visitor can
  // reach; each must fall back to stored data rather than fail the page.
  const cases = [
    ["app/deals/[id]/page.js", /catch \(err\) \{[\s\S]{0,120}return null;/],
    ["app/sealed-deals/[id]/page.js", /catch \(err\) \{[\s\S]{0,120}return \[\];/],
    ["lib/cardPriceAnalysis.js", /catch \(err\) \{[\s\S]{0,120}return null;/],
  ];
  for (const [file, re] of cases) {
    assert.match(read(file), re, `${file}: a provider failure must not fail the render`);
  }
});

test("the provider has exactly three outbound doors, and every one is key-gated", () => {
  // The pause plan is only tractable because the doors are countable and
  // all in one file. There are THREE, not two: downloadPrintingsExport
  // cannot go through fetchPPT because it needs arrayBuffer() for the
  // gzipped CSV, not json(). That third door is easy to miss - a pause
  // flag installed only in fetchPPT/fetchPPTPaced would leave the whole
  // catalogue export still calling out, which is the single largest
  // request of the lot. Hence this count.
  const ppt = read("lib/pokemonPriceTracker.js");
  const fetches = ppt.match(/await fetch\(/g) ?? [];
  assert.equal(
    fetches.length,
    3,
    "a new outbound call appeared (or one was removed) - every door must be listed in docs/preservation/ppt-pause-plan-2026-09-22.md"
  );
  // Each one must sit behind a key read, so a missing key throws before
  // any socket opens.
  const bearers = ppt.match(/Bearer \$\{apiKey\(\)\}/g) ?? [];
  assert.equal(bearers.length, fetches.length, "every outbound call constructs its header from apiKey()");
  assert.match(ppt, /if \(!key\) throw new Error\("Missing POKEMONPRICETRACKER_API_KEY"\);/);
  // and nothing outside this module may reach the provider's host.
  for (const file of ["lib/priceHistory.js", "lib/cardPriceAnalysis.js", "lib/dealQuality.js"]) {
    assert.doesNotMatch(read(file), /pokemonpricetracker\.com/, `${file} must not call the provider directly`);
  }
});
