// SEO-4 sitemap substance gate (16 Sep 2026).
//
// A sitemap is a recrawl-priority signal. Measured on 2026-09-16: 24,691
// catalogue cards were eligible for the card shards, but only 10,506 had a
// <lastmod> proving the displayed price had ever materially moved, and 620
// had a live listing. The rest advertised URLs with nothing to refetch.
//
// The gate NARROWS the sitemap only. These tests pin the three keep rules,
// the fail-open behaviour, and - most importantly - that the gate never
// touches page indexability or the sitemap-parity invariant.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { selectSitemapCards, assignCardShards } from "../../lib/cardSitemap.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const LM = new Map([["100", "2026-09-10"], ["200", "2026-08-01"]]);

test("1. a live-deal hub is always advertised, with or without a lastmod", () => {
  const cards = [
    { slug: "hub-no-lastmod", tcgplayerId: "999", marketPrice: 3, hub: true },
    { slug: "hub-with-lastmod", tcgplayerId: "100", marketPrice: 50, hub: true },
  ];
  const { kept, dropped } = selectSitemapCards(cards, { lastmodByTcg: LM });
  assert.equal(kept.length, 2);
  assert.deepEqual(dropped, []);
});

test("2. a catalogue card with a proven price change is advertised", () => {
  const cards = [{ slug: "moved", tcgplayerId: "200", marketPrice: 12, hub: false }];
  const { kept } = selectSitemapCards(cards, { lastmodByTcg: LM });
  assert.deepEqual(kept.map((c) => c.slug), ["moved"]);
});

test("3. a catalogue card that has never provably changed is NOT advertised", () => {
  const cards = [{ slug: "static-card", tcgplayerId: "555", marketPrice: 12, hub: false }];
  const { kept, dropped } = selectSitemapCards(cards, { lastmodByTcg: LM });
  assert.deepEqual(kept, []);
  assert.deepEqual(dropped, ["static-card"]);
});

test("4. an editorially linked card is advertised even with no movement", () => {
  const cards = [{ slug: "charizard-base-set", tcgplayerId: "555", marketPrice: 300, hub: false }];
  const { kept } = selectSitemapCards(cards, {
    lastmodByTcg: LM,
    editorialSlugs: new Set(["charizard-base-set"]),
  });
  assert.deepEqual(kept.map((c) => c.slug), ["charizard-base-set"]);
});

test("5. a malformed lastmod is not a substance signal", () => {
  // sanitizeLastmodMap should already have dropped these, but the gate must
  // not treat a junk value as proof the page changed
  for (const bad of ["", "not-a-day", "2026-13-01", null, undefined, 20260101]) {
    const { kept } = selectSitemapCards([{ slug: "s", tcgplayerId: "7", marketPrice: 1, hub: false }], {
      lastmodByTcg: new Map([["7", bad]]),
    });
    assert.deepEqual(kept, [], `lastmod ${JSON.stringify(bad)} must not qualify`);
  }
});

test("6. FAIL OPEN: with enforce false nothing is dropped", () => {
  // the lastmod RPC can be absent or time out, in which case the map is
  // empty - enforcing then would cut the card sitemaps to the live hubs
  const cards = [
    { slug: "a", tcgplayerId: "1", marketPrice: 1, hub: false },
    { slug: "b", tcgplayerId: "2", marketPrice: 2, hub: false },
  ];
  const { kept, dropped, enforced } = selectSitemapCards(cards, { lastmodByTcg: new Map(), enforce: false });
  assert.equal(kept.length, 2);
  assert.deepEqual(dropped, []);
  assert.equal(enforced, false);
});

test("7. the caller ties enforcement to a healthy lastmod source", () => {
  const src = read("lib/sitemap.js");
  assert.match(src, /enforce:\s*lastmod\.source === "rpc"/, "the gate must only run on a healthy RPC map");
  assert.match(src, /editorialSlugs:\s*EDITORIAL_CARD_SLUGS/);
  // the shards must be cut from the KEPT list, not the full one
  assert.match(src, /assignCardShards\(kept, lastmodByTcg\)/);
});

test("8. editorial slugs are derived from the guide registry, never hand-typed", () => {
  const src = read("lib/sitemap.js");
  assert.match(src, /Object\.values\(GUIDE_CARDS\)/);
  assert.doesNotMatch(
    src,
    /EDITORIAL_CARD_SLUGS = new Set\(\s*\[\s*"/,
    "editorial slugs must come from GUIDE_CARDS, not a literal list"
  );
});

test("9. the gate narrows only: kept is always a subset of the input", () => {
  const cards = Array.from({ length: 50 }, (_, i) => ({
    slug: `c${i}`,
    tcgplayerId: String(i),
    marketPrice: i + 1,
    hub: i % 7 === 0,
  }));
  const lm = new Map(cards.filter((_, i) => i % 3 === 0).map((c) => [c.tcgplayerId, "2026-09-01"]));
  const { kept, dropped } = selectSitemapCards(cards, { lastmodByTcg: lm });
  const input = new Set(cards.map((c) => c.slug));
  for (const c of kept) assert.ok(input.has(c.slug));
  assert.equal(kept.length + dropped.length, cards.length, "every card is either kept or dropped, never both");
});

test("10. the gate is a sitemap-membership rule only, never an indexability one", () => {
  // The whole safety argument for narrowing the sitemap: a dropped card
  // keeps its URL, canonical and indexability, and stays linked from the
  // set / species / cards hubs. So no renderable page may consult the
  // gate, and the sitemap modules must not emit robots directives.
  // (Both files legitimately DISCUSS noindex in comments, because sitemap
  // membership mirrors page indexability - so this checks emission.)
  for (const name of ["lib/sitemap.js", "lib/cardSitemap.js"]) {
    const src = read(name);
    assert.doesNotMatch(src, /robots\s*:/, `${name} must not emit robots directives`);
    assert.doesNotMatch(src, /index:\s*false/, `${name} must not set index:false`);
  }
  // no page or route may import the selector
  const pages = [
    "app/cards/[slug]/page.js",
    "app/sets/[slug]/page.js",
    "app/pokemon/[slug]/page.js",
    "app/deals/[id]/page.js",
  ];
  for (const f of pages) {
    let body;
    try {
      body = read(f);
    } catch {
      continue;
    }
    assert.doesNotMatch(body, /selectSitemapCards|EDITORIAL_CARD_SLUGS/, `${f} must not consult the sitemap gate`);
  }
});

test("11. shards cut from the kept list stay internally consistent", () => {
  const cards = [
    { slug: "a", tcgplayerId: "100", marketPrice: 150, hub: false },
    { slug: "b", tcgplayerId: "200", marketPrice: 30, hub: false },
    { slug: "c", tcgplayerId: "300", marketPrice: 30, hub: false }, // no lastmod -> dropped
  ];
  const { kept } = selectSitemapCards(cards, { lastmodByTcg: LM });
  const { shards } = assignCardShards(kept, LM);
  const all = [...shards.values()].flat().map((e) => e.slug);
  assert.deepEqual(all.sort(), ["a", "b"]);
  // every advertised card carries the lastmod that earned it its place
  for (const e of [...shards.values()].flat()) assert.ok(e.lastmod, `${e.slug} should carry a lastmod`);
});
