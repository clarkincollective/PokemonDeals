// SEO-3 / SEO-3.1 - card sitemap value bands, null-reference membership,
// truthful lastmod, shared-snapshot identity (lib/cardSitemap.js).
// Pure rules, no network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CARD_VALUE_BANDS, CARD_SITEMAP_SEGMENTS, NO_REFERENCE_SHARD, cardValueBand, cardReferenceLastmod, assignCardShards,
  isCardSitemapSegment, nextDay, cardSitemapSnapshotId, sanitizeLastmodMap,
  isMaterialChange, LASTMOD_MIN_CHANGE_USD, LASTMOD_MIN_CHANGE_PCT,
} from "../../lib/cardSitemap.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TODAY = "2026-09-10";

// --- A/B: bands + boundaries ---------------------------------------------

test("bands: four contiguous, non-overlapping USD bands covering (0, inf); bulk also names the no-reference rule", () => {
  assert.deepEqual(CARD_SITEMAP_SEGMENTS, ["cards-high", "cards-mid", "cards-low", "cards-bulk"]);
  const sorted = [...CARD_VALUE_BANDS].sort((a, b) => a.min - b.min);
  assert.equal(sorted[0].min, 0);
  assert.equal(sorted.at(-1).max, null);
  for (let i = 1; i < sorted.length; i++) assert.equal(sorted[i].min, sorted[i - 1].max, "bands must be contiguous");
  for (const k of CARD_SITEMAP_SEGMENTS) assert.ok(isCardSitemapSegment(k));
  assert.ok(!isCardSitemapSegment("cards"));
  assert.equal(NO_REFERENCE_SHARD, "cards-bulk");
  assert.match(CARD_VALUE_BANDS.find((b) => b.key === "cards-bulk").description, /no canonical reference value/);
});

test("bands: exact lower boundary is inclusive, upper boundary exclusive", () => {
  assert.equal(cardValueBand(100), "cards-high");
  assert.equal(cardValueBand(99.99), "cards-mid");
  assert.equal(cardValueBand(25), "cards-mid");
  assert.equal(cardValueBand(24.99), "cards-low");
  assert.equal(cardValueBand(5), "cards-low");
  assert.equal(cardValueBand(4.99), "cards-bulk");
  assert.equal(cardValueBand(0.03), "cards-bulk");
  assert.equal(cardValueBand(4999.99), "cards-high");
  assert.equal(cardValueBand("25"), "cards-mid"); // numeric string from PostgREST
  assert.equal(cardValueBand(25.005), "cards-mid");
});

test("bands: null / zero / negative / NaN prices are not bandable (no price is ever guessed)", () => {
  for (const v of [null, undefined, 0, -3, NaN, "abc", ""]) assert.equal(cardValueBand(v), null, `value ${v}`);
  // a sentinel is a real number to this function (it is excluded upstream
  // by catalogPriceOk); the band layer never widens membership itself
  assert.equal(cardValueBand(999.99), "cards-high");
});

// --- C: lastmod ------------------------------------------------------------

const c = (observed_on, price) => ({ observed_on, price, source: "catalog" });

test("lastmod: the latest MATERIAL first-party change wins (Charizard base: $868.56 -> $897.19 on 09-04)", () => {
  const rows = [c("2026-09-01", 868.56), c("2026-09-02", 868.56), c("2026-09-04", 897.19), c("2026-09-05", 897.19), c("2026-09-10", 897.19)];
  assert.equal(cardReferenceLastmod(rows, { today: TODAY }), "2026-09-04");
  assert.equal(cardReferenceLastmod([...rows].reverse(), { today: TODAY }), "2026-09-04");
});

test("lastmod: cent-level noise is NOT a change; a flat or single-observation history gets NO lastmod", () => {
  // $0.30 -> $0.31 -> $0.30 ...: 1-cent wiggles (below $0.05)
  const noisy = [c("2026-09-02", 0.3), c("2026-09-03", 0.31), c("2026-09-04", 0.3), c("2026-09-05", 0.32), c("2026-09-06", 0.31)];
  assert.equal(cardReferenceLastmod(noisy, { today: TODAY }), null);
  // $120.00 -> $121.50 is 1.25%: above $0.05 but below 2%
  assert.equal(cardReferenceLastmod([c("2026-09-02", 120), c("2026-09-03", 121.5)], { today: TODAY }), null);
  assert.equal(cardReferenceLastmod([c("2026-09-02", 5), c("2026-09-09", 5)], { today: TODAY }), null);
  assert.equal(cardReferenceLastmod([c("2026-09-02", 5)], { today: TODAY }), null, "a first recorded day is not a change");
});

test("lastmod: both thresholds are inclusive and exact at the boundary (integer cents, matching SQL numeric)", () => {
  assert.equal(cardReferenceLastmod([c("2026-09-02", 2.5), c("2026-09-03", 2.55)], { today: TODAY }), "2026-09-03", "5c = 2% of $2.50");
  assert.equal(cardReferenceLastmod([c("2026-09-02", 2.5), c("2026-09-03", 2.54)], { today: TODAY }), null);
  assert.equal(cardReferenceLastmod([c("2026-09-02", 10), c("2026-09-03", 10.2)], { today: TODAY }), "2026-09-03", "20c = 2% of $10");
  assert.equal(cardReferenceLastmod([c("2026-09-02", 10), c("2026-09-03", 10.19)], { today: TODAY }), null);
  assert.equal(cardReferenceLastmod([c("2026-09-02", 10), c("2026-09-03", 9.8)], { today: TODAY }), "2026-09-03", "drops count too");
  assert.equal(LASTMOD_MIN_CHANGE_USD, 0.05);
  assert.equal(LASTMOD_MIN_CHANGE_PCT, 0.02);
  assert.ok(isMaterialChange(250, 255) && !isMaterialChange(250, 254));
});

test("lastmod: slow drift accumulates against the last COUNTED price (anchor), then counts", () => {
  // +1% a day from $10.00: never 2% day-over-day, but 2% from the anchor on day 3
  const drift = [c("2026-09-02", 10), c("2026-09-03", 10.1), c("2026-09-04", 10.2), c("2026-09-05", 10.3), c("2026-09-06", 10.4)];
  // anchor 10.00 -> counted at 10.20 (09-04), new anchor 10.20 -> 10.40 is +1.96% (< 2%) -> not counted
  assert.equal(cardReferenceLastmod(drift, { today: TODAY }), "2026-09-04");
  assert.equal(cardReferenceLastmod([...drift, c("2026-09-07", 10.41)], { today: TODAY }), "2026-09-07");
});

test("lastmod: provider backfill never counts - not a backfill change, not a backfill -> first-party step, not a first recorded day", () => {
  const backfillOnly = [
    { observed_on: "2025-01-27", price: 0.66, source: "ppt_backfill" },
    { observed_on: "2025-03-10", price: 9.71, source: "ppt_backfill" },
  ];
  assert.equal(cardReferenceLastmod(backfillOnly, { today: TODAY }), null);
  // the 2026-09-02 recording-expansion artifact: backfill $4.00, first catalog day $6.00
  const step = [{ observed_on: "2026-09-01", price: 4, source: "ppt_backfill" }, c("2026-09-02", 6), c("2026-09-03", 6), c("2026-09-10", 6)];
  assert.equal(cardReferenceLastmod(step, { today: TODAY }), null);
  // a same-day backfill point never overrides or adds to the first-party series
  const sameDay = [c("2026-09-02", 10), { observed_on: "2026-09-03", price: 50, source: "ppt_backfill" }, c("2026-09-03", 10)];
  assert.equal(cardReferenceLastmod(sameDay, { today: TODAY }), null);
  const src = readFileSync(join(REPO, "lib", "cardSitemap.js"), "utf8");
  assert.match(src, /first-party observations only/);
});

test("lastmod: missing / empty / invalid history => null (omitted), never a fallback", () => {
  assert.equal(cardReferenceLastmod([], { today: TODAY }), null);
  assert.equal(cardReferenceLastmod(null, { today: TODAY }), null);
  assert.equal(cardReferenceLastmod([{ observed_on: "not-a-date", price: 5, source: "catalog" }], { today: TODAY }), null);
  assert.equal(cardReferenceLastmod([{ observed_on: "2026-02-30", price: 5, source: "catalog" }], { today: TODAY }), null);
  assert.equal(cardReferenceLastmod([{ observed_on: "2026-09-01", price: 0, source: "catalog" }], { today: TODAY }), null);
  assert.equal(cardReferenceLastmod([{ observed_on: "2026-09-01", price: null, source: "catalog" }], { today: TODAY }), null);
  assert.equal(cardReferenceLastmod([{ observed_on: "2026-09-01", price: 999.99, source: "catalog" }], { today: TODAY }), null);
});

test("lastmod: future-dated observations are ignored (one-day clock tolerance), so output is never in the future", () => {
  const rows = [
    { observed_on: "2026-09-01", price: 10, source: "catalog" },
    { observed_on: "2026-09-11", price: 11, source: "catalog" }, // today + 1: tolerated
    { observed_on: "2026-09-12", price: 12, source: "catalog" }, // beyond tolerance: dropped
    { observed_on: "2030-01-01", price: 99, source: "catalog" },
  ];
  assert.equal(cardReferenceLastmod(rows, { today: TODAY }), "2026-09-11");
  assert.equal(cardReferenceLastmod([{ observed_on: "2030-01-01", price: 99, source: "catalog" }], { today: TODAY }), null);
  assert.equal(nextDay("2026-12-31"), "2027-01-01");
});

test("lastmod: no Date.now() / clock fallback; an unavailable RPC degrades to no lastmod, never a substitute", () => {
  assert.throws(() => cardReferenceLastmod([{ observed_on: "2026-09-01", price: 1, source: "catalog" }]), /explicit today/);
  const src = readFileSync(join(REPO, "lib", "cardSitemap.js"), "utf8").replace(/\/\/[^\n]*/g, "");
  assert.ok(!/Date\.now\(|new Date\(\)/.test(src), "lib/cardSitemap.js must not read the clock");
  const sm = readFileSync(join(REPO, "lib", "sitemap.js"), "utf8").replace(/\/\/[^\n]*/g, "");
  const cardBlock = sm.slice(sm.indexOf("async function fetchCardLastmodMapUncached"), sm.indexOf("const STATIC_ROUTES"));
  assert.ok(!/Date\.now\(|new Date\(/.test(cardBlock), "card sitemap dataset must not stamp a clock value");
  assert.match(cardBlock, /return \{ map: \{\}, source: "unavailable"/, "an unavailable lastmod source must degrade to an empty map");
  assert.match(cardBlock, /if \(error\) throw new Error\(error\.message\)/, "a failing RPC must not be cached as a result");
  // Phase 17B: one un-paged call through the SERVICE-ROLE client.
  // price_history is deny-all to anon and the function is SECURITY
  // INVOKER, so the public client would get an empty object - silently.
  assert.match(cardBlock, /const db = supabaseAdmin\(\);/, "lastmod must be read with the service-role client");
  assert.match(cardBlock, /db\.rpc\("card_reference_lastmod", \{ p_after: after, p_limit: LASTMOD_PAGE_CARDS \}\)/, "keyset-paged RPC");
  assert.ok(!/supabase\.rpc\("card_reference_lastmod"/.test(cardBlock), "the anon client cannot see price_history - never call the RPC through it");
  assert.ok(!/card_reference_lastmod"[^)]*\)\.range\(/.test(cardBlock), "no .range() paging: each page re-ran the whole query with no stable order");
  assert.match(cardBlock, /sanitizeLastmodMap\(data\.lastmod\)/, "every page's dates must pass through the validator");
  assert.match(cardBlock, /pages overlap/, "overlapping pages are an error, not a silent overwrite");
  assert.match(cardBlock, /keyset did not advance/, "a non-advancing keyset must fail instead of looping");
  assert.match(cardBlock, /exceeded its page budget/, "bounded page budget; a partial map is never returned");
});

test("lastmod: sanitizeLastmodMap keeps only real calendar days and drops everything else (never repairs)", () => {
  assert.deepEqual(
    sanitizeLastmodMap({
      "1": "2026-09-10",
      "2": "2026-02-30", // not a real day
      "3": "2026-9-1", // malformed
      "4": null,
      "5": 20260910,
      "6": "2026-09-10T00:00:00Z", // not a bare date
      "": "2026-09-10", // empty id
    }),
    { "1": "2026-09-10" }
  );
  for (const bad of [null, undefined, [], "x", 5]) assert.deepEqual(sanitizeLastmodMap(bad), {});
});

test("data cache: every cached sitemap input stays under Next's 2 MB entry limit; the composed dataset is never cached", () => {
  const sm = readFileSync(join(REPO, "lib", "sitemap.js"), "utf8");
  assert.match(sm, /unstable_cache\(fetchCardLastmodMapUncached, \["card-sitemap-lastmod"\], \{\s*revalidate: 21600/);
  assert.match(sm, /export async function fetchCardSitemapDataset\(\)/);
  assert.ok(!/unstable_cache\(fetchCardSitemapDataset/.test(sm), "the ~2.3 MB composed dataset must not be handed to the data cache");
  const deals = readFileSync(join(REPO, "lib", "deals.js"), "utf8");
  assert.match(deals, /unstable_cache\(fetchCatalogCardSitemapRowsUncached, \["catalog-card-sitemap-rows"\], \{\s*revalidate: 21600/);
  const block = deals.slice(deals.indexOf("async function fetchCatalogCardSitemapRowsUncached"), deals.indexOf("export const fetchCatalogCardSitemapRows"));
  assert.match(block, /bySlug\.set\(slug, \[slug, id, Number\(r\.market_price\)\]\)/, "catalogue rows must be compact tuples");
  assert.match(block, /Promise\.all\(starts\.map\(page\)\)/, "catalogue pages must be fetched in parallel");
});

test("lastmod: output is a W3C date the sitemap builder emits verbatim (no timezone shift)", () => {
  const v = cardReferenceLastmod(
    [{ observed_on: "2026-09-03T00:00:00+00:00", price: 5, source: "catalog" }, { observed_on: "2026-09-04T00:00:00+00:00", price: 6, source: "catalog" }],
    { today: TODAY }
  );
  assert.equal(v, "2026-09-04");
  assert.match(v, /^\d{4}-\d{2}-\d{2}$/);
});

// --- SQL contract (static) -----------------------------------------------

test("sql: card_reference_lastmod is read-only, invoker-rights, empty search_path, service-role only, exposes only id -> date", () => {
  const sql = readFileSync(join(REPO, "supabase", "card_reference_lastmod_migration.sql"), "utf8");
  const body = sql.replace(/--[^\n]*/g, "");
  assert.match(body, /create or replace function public\.card_reference_lastmod\(p_after text, p_limit integer\)\s*returns jsonb/i);
  // plpgsql because the anchor rule is sequential - but STATIC SQL only
  assert.match(body, /language plpgsql/i);
  assert.match(body, /\bstable\b/i);
  assert.match(body, /security invoker/i);
  assert.match(body, /set search_path = ''/i);
  assert.match(body, /from public\.price_history/i);
  assert.match(body, /from public\.card_catalog/i);
  const fnBody = body.slice(body.indexOf("as $$"), body.lastIndexOf("$$;"));
  for (const bad of [/\binsert\b/i, /\bupdate\b/i, /\bdelete\b/i, /\btruncate\b/i, /\bdrop\b/i, /\balter\b/i, /\bcreate\b/i, /\bgrant\b/i, /\bexecute\b/i, /\bperform\b/i, /\bnotify\b/i, /\bset_config\b/i, /\bcopy\b/i]) {
    assert.ok(!bad.test(fnBody), `function body contains ${bad}`);
  }
  for (const bad of [/\binsert\b/i, /\bupdate\b/i, /\bdelete\b/i, /\btruncate\b/i, /\bdrop\b/i, /\balter\b/i, /security definer/i, /\bvolatile\b/i, /create (materialized )?(view|table)/i, /\bexecute\s+format\b/i]) {
    assert.ok(!bad.test(body), `migration contains ${bad}`);
  }
  // keyset page: bounded size, key range (p_after, last_key] from the catalogue PK
  assert.match(body, /least\(greatest\(coalesce\(p_limit, 2500\), 1\), 5000\)/, "page size is clamped");
  assert.match(body, /ph\.tcgplayer_id > v_after\s+and ph\.tcgplayer_id <= v_last/, "history is read for exactly (p_after, last_key]");
  assert.match(body, /order by c\.tcgplayer_id/);
  assert.match(body, /order by ph\.tcgplayer_id, ph\.observed_on/);
  // the v4 rule: first-party only, first day is the anchor, >= $0.05 AND >= 2% vs the last counted price
  assert.match(body, /ph\.source = 'catalog'/, "only first-party observations count");
  assert.ok(!/ppt_backfill/.test(fnBody), "provider backfill must never feed lastmod");
  assert.match(body, /v_cur\s+:= r\.tcgplayer_id;\s+v_anchor := r\.price;\s+v_lm\s+:= null;/, "a card's first recorded day is the anchor, never a change");
  assert.match(body, /abs\(r\.price - v_anchor\) >= 0\.05\s+and abs\(r\.price - v_anchor\) \* 50 >= v_anchor/);
  assert.match(body, /v_lm\s+:= r\.observed_on;\s+v_anchor := r\.price;/, "a counted change re-anchors");
  // the same shared filters as the JS contract
  assert.match(body, /observed_on <= current_date \+ 1/);
  assert.match(body, /price not in \(999, 999\.99, 9999, 9999\.99, 99999, 99999\.99\)/);
  // only id -> date leaves the function, never a price
  assert.match(body, /to_char\(v_lm, 'YYYY-MM-DD'\)/);
  assert.match(body, /'lastmod', coalesce\(jsonb_object\(v_ids, v_days\), '\{\}'::jsonb\)/, "an empty page is an empty object, not NULL");
  assert.ok(!/'price'/.test(fnBody), "no price leaves the function");
  // service role only: PUBLIC / anon / authenticated EXECUTE revoked
  assert.match(body, /revoke execute on function public\.card_reference_lastmod\(text, integer\) from public, anon, authenticated/i);
  assert.match(body, /grant execute on function public\.card_reference_lastmod\(text, integer\) to service_role;/i);
  assert.ok(!/grant execute[^;]*\b(anon|authenticated)\b/i.test(body), "anon / authenticated must not be granted EXECUTE");
});

// --- A/D/E: shard assignment ----------------------------------------------

const CARDS = [
  { slug: "charizard-base-set", tcgplayerId: "42382", marketPrice: 897.19 },
  { slug: "pikachu-base-set", tcgplayerId: "1", marketPrice: 25 },
  { slug: "kakuna-base-set-shadowless", tcgplayerId: "2", marketPrice: 24.99 },
  { slug: "drilbur-sv05-temporal-forces", tcgplayerId: "3", marketPrice: 0.15 },
  { slug: "rayquaza-ex-emerald", tcgplayerId: "88626", marketPrice: null }, // live hub, null catalogue reference
  { slug: "charizard-base-set", tcgplayerId: "42382", marketPrice: 897.19 }, // duplicate slug
];
const LASTMOD = new Map([["42382", "2026-09-04"], ["1", "2025-01-27"], ["3", "bad-date"], ["88626", "2026-09-05"]]);

test("shards: every card lands in exactly one shard; duplicates collapse; nothing is dropped", () => {
  const { shards, noReference } = assignCardShards(CARDS, LASTMOD);
  const all = [...shards.values()].flat().map((e) => e.slug);
  assert.equal(all.length, 5, "5 unique slugs expected");
  assert.equal(new Set(all).size, all.length, "a slug appears in more than one shard");
  assert.deepEqual(shards.get("cards-high").map((e) => e.slug), ["charizard-base-set"]);
  assert.deepEqual(shards.get("cards-mid").map((e) => e.slug), ["pikachu-base-set"]);
  assert.deepEqual(shards.get("cards-low").map((e) => e.slug), ["kakuna-base-set-shadowless"]);
  assert.deepEqual(shards.get("cards-bulk").map((e) => e.slug).sort(), ["drilbur-sv05-temporal-forces", "rayquaza-ex-emerald"]);
  assert.deepEqual(noReference, ["rayquaza-ex-emerald"]);
});

test("shards (null reference): an indexed hub with no canonical reference is in cards-bulk BY THAT SHARD'S RULE, flagged, with no guessed price and its own lastmod", () => {
  const { shards } = assignCardShards(CARDS, LASTMOD);
  const entry = shards.get(NO_REFERENCE_SHARD).find((e) => e.slug === "rayquaza-ex-emerald");
  assert.ok(entry, "null-reference hub missing from the no-reference shard");
  assert.equal(entry.noReference, true);
  assert.equal(entry.lastmod, "2026-09-05"); // lastmod is joined by tcgplayer_id, independent of the band
  const priced = shards.get("cards-bulk").find((e) => e.slug === "drilbur-sv05-temporal-forces");
  assert.equal(priced.noReference, false);
  // the rule is stated on the band definition itself
  assert.match(CARD_VALUE_BANDS.find((b) => b.key === NO_REFERENCE_SHARD).description, /below \$5, or an indexed card hub with no canonical reference value/);
});

test("shards: lastmod is joined by tcgplayer_id, only when it is a valid date", () => {
  const { shards } = assignCardShards(CARDS, LASTMOD);
  const flat = new Map([...shards.values()].flat().map((e) => [e.slug, e.lastmod]));
  assert.equal(flat.get("charizard-base-set"), "2026-09-04");
  assert.equal(flat.get("pikachu-base-set"), "2025-01-27");
  assert.equal(flat.get("kakuna-base-set-shadowless"), null); // no history
  assert.equal(flat.get("drilbur-sv05-temporal-forces"), null); // invalid value ignored
});

test("shards (movement): $99.99->$100.00, $25.00->$24.99, $5.00->$4.99 each land in the NEW band only within one snapshot", () => {
  const cases = [
    [99.99, "cards-mid", 100, "cards-high"],
    [25, "cards-mid", 24.99, "cards-low"],
    [5, "cards-low", 4.99, "cards-bulk"],
  ];
  for (const [p0, b0, p1, b1] of cases) {
    const before = assignCardShards([{ slug: "x", tcgplayerId: "9", marketPrice: p0 }]).shards;
    const after = assignCardShards([{ slug: "x", tcgplayerId: "9", marketPrice: p1 }]).shards;
    assert.deepEqual(before.get(b0).map((e) => e.slug), ["x"], `$${p0} should be ${b0}`);
    assert.equal([...before.values()].flat().length, 1, "exactly once before");
    assert.deepEqual(after.get(b1).map((e) => e.slug), ["x"], `$${p1} should be ${b1}`);
    assert.equal([...after.values()].flat().length, 1, "exactly once after");
    assert.deepEqual(after.get(b0), [], "old band must be empty in the new snapshot");
  }
});

test("shards (adjacent snapshots model): mixing an OLD shard with a NEW shard can duplicate or miss a moved card - so shards must be served from one snapshot", () => {
  const N = assignCardShards([{ slug: "x", tcgplayerId: "9", marketPrice: 99.99 }]).shards;   // snapshot N: mid
  const N1 = assignCardShards([{ slug: "x", tcgplayerId: "9", marketPrice: 100 }]).shards;    // snapshot N+1: high
  const has = (shard) => shard.some((e) => e.slug === "x");
  // stale old-band response (N) + fresh new-band response (N+1): seen twice
  assert.equal(has(N.get("cards-mid")) && has(N1.get("cards-high")), true);
  // stale new-band response (N) + fresh old-band response (N+1): seen nowhere
  assert.equal(has(N.get("cards-high")) || has(N1.get("cards-mid")), false);
  // the identity makes the two generations distinguishable
  assert.notEqual(cardSitemapSnapshotId(N), cardSitemapSnapshotId(N1));
});

test("snapshot id: deterministic over membership + lastmod, identical for all four shards of one generation, no clock", () => {
  const a = assignCardShards(CARDS, LASTMOD).shards;
  const b = assignCardShards([...CARDS].reverse(), LASTMOD).shards;
  assert.equal(cardSitemapSnapshotId(a), cardSitemapSnapshotId(b));
  assert.match(cardSitemapSnapshotId(a), /^[0-9a-f]{16}$/);
  const moved = new Map([["42382", "2026-09-05"], ["1", "2025-01-27"], ["88626", "2026-09-05"]]);
  assert.notEqual(cardSitemapSnapshotId(a), cardSitemapSnapshotId(assignCardShards(CARDS, moved).shards));
  const sm = readFileSync(join(REPO, "lib", "sitemap.js"), "utf8");
  assert.match(sm, /snapshotId = cardSitemapSnapshotId\(shards\)/);
  assert.match(sm, /card-sitemap snapshot \$\{dataset\.snapshotId\} lastmod-source \$\{dataset\.lastmodSource\}/);
});

test("shards: the route serves every child per request from ONE cached dataset (no per-child ISR copy)", () => {
  const sm = readFileSync(join(REPO, "lib", "sitemap.js"), "utf8");
  assert.match(sm, /if \(isCardSitemapSegment\(segment\)\) \{\s*const dataset = await fetchCardSitemapDataset\(\);/);
  assert.ok(!/case "cards":/.test(sm), "the old flat cards case must be gone");
  assert.match(sm, /SITEMAP_SEGMENTS = \["pages", "sets", "pokemon", \.\.\.CARD_SITEMAP_SEGMENTS, "deals", "sealed-deals"\]/);
  assert.match(sm, /SITEMAP_CACHE_CONTROL_CARDS = "public, max-age=0, s-maxage=300, stale-while-revalidate=300"/);
  const route = readFileSync(join(REPO, "app", "sitemaps", "[segment]", "route.js"), "utf8");
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.ok(!/generateStaticParams|export const revalidate/.test(route), "child sitemaps must not keep independent ISR copies");
  assert.match(route, /segmentXml\(key\)/);
});

test("shards: membership predicate is the existing canonical card-indexability rule (no widening/narrowing)", () => {
  const deals = readFileSync(join(REPO, "lib", "deals.js"), "utf8");
  const block = deals.slice(deals.indexOf("async function fetchCatalogCardSitemapRowsUncached"), deals.indexOf("export const fetchCatalogCardSitemapRows"));
  assert.match(block, /catalogPriceOk\(r\.market_price\)/);
  assert.match(block, /isRealCardName\(r\.name\)/);
  assert.match(block, /\.eq\("language", "english"\)/);
  assert.match(block, /\.not\("image_url", "is", null\)/);
  assert.match(block, /catalogCardSlug\(r\.name, r\.set\)/);
});

function nextDayN(day, n) {
  let d = day;
  for (let i = 0; i < n; i++) d = nextDay(d);
  return d;
}
