// Phase 13B.6.3 - the card_catalog-derived set structures, extracted so
// /api/refresh-catalog can precompute them into catalog_snapshot and the
// /search cold path reads one JSON row instead of a ~24-request full
// card_catalog scan. These MUST be deterministic and byte-identical to
// the old inline scan output (no semantic change - 13B.6.3 §23).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildSetVocabularyFromRows,
  buildCatalogSetsFromRows,
} from "../../lib/setCatalogAggregates.js";
import { buildSetAliases } from "../../lib/pokemonSets.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// ===== set vocabulary =========================================

const VOCAB_ROWS = [
  { set: "Base Set", set_id: "604" },
  { set: "Base Set", set_id: "604" }, // dup - first set_id wins, one entry
  { set: "Base Set 2", set_id: "1103" },
  { set: "Base Set (Shadowless)", set_id: "1663" },
  { set: "SWSH07: Evolving Skies", set_id: "2848" },
  { set: "SV: Scarlet & Violet 151", set_id: "23237" },
  { set: null, set_id: "x" }, // ignored
];

test("buildSetVocabularyFromRows: one entry per distinct set, first set_id", () => {
  const v = buildSetVocabularyFromRows(VOCAB_ROWS);
  const names = v.map((s) => s.name).sort();
  assert.deepEqual(names, ["Base Set", "Base Set (Shadowless)", "Base Set 2", "SV: Scarlet & Violet 151", "SWSH07: Evolving Skies"]);
  assert.equal(v.find((s) => s.name === "Base Set").set_id, "604");
  assert.equal(v.find((s) => s.name === "SWSH07: Evolving Skies").set_id, "2848");
});

test("buildSetVocabularyFromRows: slug + phrases from buildSetAliases", () => {
  const v = buildSetVocabularyFromRows(VOCAB_ROWS);
  const es = v.find((s) => s.name === "SWSH07: Evolving Skies");
  assert.equal(es.slug, "swsh07-evolving-skies");
  assert.ok(es.phrases.includes("evolving skies"));
  assert.ok(es.phrases.includes("swsh07: evolving skies"));
});

test("buildSetVocabularyFromRows: an alias shared by 2 sets is dropped from both", () => {
  // "Base Set" (plain) vs "Base Set (Shadowless)" - the parenthetical set
  // keeps only its full name, so "base set" belongs only to the plain set.
  const v = buildSetVocabularyFromRows(VOCAB_ROWS);
  const plain = v.find((s) => s.name === "Base Set");
  const shadow = v.find((s) => s.name === "Base Set (Shadowless)");
  assert.ok(plain.phrases.includes("base set"));
  assert.ok(!shadow.phrases.includes("base set"));
});

test("buildSetVocabularyFromRows: the full name always survives as a phrase", () => {
  const v = buildSetVocabularyFromRows([{ set: "Weird & Set", set_id: "1" }]);
  assert.ok(v[0].phrases.includes("weird & set"));
});

test("buildSetVocabularyFromRows: empty / nullish input -> []", () => {
  assert.deepEqual(buildSetVocabularyFromRows([]), []);
  assert.deepEqual(buildSetVocabularyFromRows(null), []);
});

// ===== catalog sets (>= SET_CATALOG_MIN_CARDS eligible) ========

function eligibleRow(set, i) {
  return {
    set,
    name: `Card ${set} ${i}`, // real single-card name
    tcgplayer_id: `${set}-${i}`,
    market_price: 5,
    image_url: "https://x/y.jpg",
  };
}

test("buildCatalogSetsFromRows: only sets with >= 10 eligible cards, count + slug", () => {
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push(eligibleRow("Big Set", i));
  for (let i = 0; i < 4; i++) rows.push(eligibleRow("Tiny Set", i));
  const out = buildCatalogSetsFromRows(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].set, "Big Set");
  assert.equal(out[0].count, 12);
  assert.equal(out[0].slug, "big-set");
});

test("buildCatalogSetsFromRows: non-card / unpriced / imageless rows are not eligible", () => {
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push(eligibleRow("Real Set", i));
  // 20 junk rows for "Junk Set" - box/tin names, no image, sentinel price
  for (let i = 0; i < 20; i++) {
    rows.push({ set: "Junk Set", name: "Booster Box", tcgplayer_id: `j${i}`, market_price: 9999, image_url: null });
  }
  const out = buildCatalogSetsFromRows(rows).map((s) => s.set);
  assert.deepEqual(out, ["Real Set"]);
});

test("buildCatalogSetsFromRows: sorted by count desc", () => {
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(eligibleRow("A", i));
  for (let i = 0; i < 15; i++) rows.push(eligibleRow("B", i));
  const out = buildCatalogSetsFromRows(rows);
  assert.deepEqual(out.map((s) => s.set), ["A", "B"]);
});

// ===== wiring: deals.js reads the snapshot first, cron writes it ===

test("fetchSetSearchVocabulary / fetchCatalogSets read a catalog_snapshot first", () => {
  const src = read("lib/deals.js");
  assert.match(src, /readCatalogSnapshot\("setVocabulary"\)/);
  assert.match(src, /readCatalogSnapshot\("catalogSets"\)/);
  // and delegate the (fallback) build to the shared pure helpers
  assert.match(src, /buildSetVocabularyFromRows\(rows\)/);
  assert.match(src, /buildCatalogSetsFromRows\(rows\)/);
});

test("/api/refresh-catalog writes the setVocabulary + catalogSets snapshots", () => {
  const src = read("app/api/refresh-catalog/route.js");
  assert.match(src, /kind: "setVocabulary"/);
  assert.match(src, /kind: "catalogSets"/);
  assert.match(src, /buildSetVocabularyFromRows/);
  assert.match(src, /buildCatalogSetsFromRows/);
  // it is a SEPARATE try/catch so a card_catalog scan failure leaves the
  // deal snapshots (sets / cardHubs / speciesHubs) intact.
  assert.match(src, /setSnapshotError/);
});

test("live deal state is NOT part of these long-lived deterministic snapshots", () => {
  const src = read("lib/setCatalogAggregates.js")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  // no live-deal columns / no query against the deals table
  assert.ok(!/is_active|total_price|discount_pct|affiliate_url|from\(["']deals["']\)/i.test(src),
    "set catalogue aggregates must be card_catalog identity only, never live deal fields");
  // the source rows are card_catalog identity fields only
  assert.match(src, /set_id|market_price|image_url|tcgplayer_id/);
});
