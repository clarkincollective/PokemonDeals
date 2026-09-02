import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get, parseHtml, sitemapUrls, pathOf, sample } from "./lib.mjs";

// SEO Phase 9A - the /market-data section as first-party, cite-worthy
// assets. The ranking must be an honest CROSS-CATALOGUE raw-market-value
// list (not deal-scoped, not graded, not auction records), every row must
// feed a durable card/set/Pokemon page, and the price-composition stat
// must be reproducible from a dated snapshot.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const PATHS = ["/market-data", "/market-data/most-expensive-cards", "/market-data/most-listed-cards"];

let pages = {};
before(async () => {
  for (const p of PATHS) {
    const res = await get(p);
    pages[p] = { res, parsed: res.status === 200 ? parseHtml(res.body) : null };
  }
});

// --- helpers -------------------------------------------------------------

function ldOfType(parsed, type) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    if (n["@type"] === type) out.push(n);
    for (const v of Object.values(n)) if (v && typeof v === "object") walk(v);
  };
  for (const b of parsed.jsonLd) if (b.ok) walk(b.data);
  return out;
}

// === 1. all three routes indexable + self-canonical =====================

describe("14/15/18: market-data routes are indexable and self-canonical", () => {
  for (const p of PATHS) {
    test(p, () => {
      const { res, parsed } = pages[p];
      assert.equal(res.status, 200, `${p} -> HTTP ${res.status}`);
      assert.ok(!/noindex/.test(parsed.robots ?? ""), `${p} is noindex`);
      assert.equal(pathOf(parsed.canonicals[0]), p, `${p} canonical is ${parsed.canonicals[0]}`);
    });
  }

  test("all three are in the pages sitemap, and no extra /market-data route exists", async () => {
    const { locs } = await sitemapUrls();
    const md = locs.map(pathOf).filter((l) => l === "/market-data" || l.startsWith("/market-data/"));
    assert.deepEqual([...md].sort(), [...PATHS].sort(), `market-data sitemap set drifted: ${md}`);
  });
});

// === 2/3/16. titles stable, no volatile numbers, spelling ===============

describe("3/16/17: stable titles, no keyword stuffing, Pokemon spelling", () => {
  for (const p of PATHS) {
    test(p, () => {
      const { parsed, res } = pages[p];
      assert.ok(!/\d/.test(parsed.title), `${p} <title> carries a volatile number: ${parsed.title}`);
      assert.ok(!/Pokémon/.test(res.body), `${p} rendered an accented "Pokémon"`);
    });
  }
});

// === 4/9/10. most-valuable page: metric definition + no overclaim ======

describe("4/9/10/11: most-valuable is an honest raw cross-catalogue ranking", () => {
  const P = "/market-data/most-expensive-cards";

  test("H1 + copy define the metric as RAW / ungraded market value", () => {
    const { parsed, res } = pages[P];
    assert.equal(parsed.h1s.length, 1);
    assert.match(parsed.h1s[0], /raw market value/i, `H1: ${parsed.h1s[0]}`);
    const body = res.body.toLowerCase();
    assert.ok(body.includes("ungraded"), "no 'ungraded' qualifier in the body");
    assert.ok(body.includes("raw"), "no 'raw' qualifier in the body");
  });

  test("explicitly disclaims graded / confirmed-sale / auction-record framing", () => {
    // strip tags so a disclaimer split across <strong>/<span> still reads
    // as one sentence
    const text = pages[P].res.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    // a single "not ... graded ... auction/sale ..." style disclaimer
    assert.match(
      text,
      /\bnot\b[^.]*\b(graded|ungraded)\b[^.]*\b(auction|sale|confirmed|record|PSA)/i,
      "no combined 'these are not graded / auction / confirmed sale' disclaimer"
    );
    // and it must not present graded tiers as the ranking basis
    assert.ok(
      !/ranked by [^.]*\b(PSA|BGS|CGC|graded)\b/i.test(text),
      "ranking is described as based on graded values"
    );
    assert.ok(
      !/\b(PSA|BGS|CGC)\s*10 (value|price)s?\b/i.test(text),
      "quotes a specific graded-slab value"
    );
  });

  test("methodology names the provider and links /methodology", () => {
    const body = pages[P].res.body;
    assert.match(body, /PokemonPriceTracker/);
    assert.match(body, /href="\/methodology"/);
  });

  test("snapshot: a real dated catalogue snapshot, not a render-time fake", () => {
    const body = pages[P].res.body;
    assert.match(body, /Catalogue snapshot:/i);
    const m = body.match(/Catalogue snapshot:.*?<time[^>]+dateTime="([^"]+)"/s);
    assert.ok(m, "no <time dateTime> next to the snapshot label");
    const ts = new Date(m[1]).getTime();
    assert.ok(Number.isFinite(ts), `unparseable snapshot time ${m[1]}`);
    // The catalogue sync is daily - the snapshot must be in the past and
    // not "right now" (a new Date() freshness fake would be < 2 min old).
    const ageMs = Date.now() - ts;
    assert.ok(ageMs > 2 * 60 * 1000, `snapshot is only ${Math.round(ageMs / 1000)}s old - looks fabricated`);
    assert.ok(ageMs < 40 * 24 * 3600 * 1000, `snapshot is ${Math.round(ageMs / 86400000)}d old - stale`);
  });

  test("bounded ItemList (<= 100) and bounded payload", () => {
    const { parsed, res } = pages[P];
    const lists = ldOfType(parsed, "ItemList");
    assert.ok(lists.length >= 1, "no ItemList JSON-LD");
    for (const l of lists) {
      const n = (l.itemListElement ?? []).length;
      assert.ok(n > 0 && n <= 100, `ItemList has ${n} entries (want 1..100)`);
    }
    const rows = (res.body.match(/href="\/cards\//g) ?? []).length;
    assert.ok(rows > 0 && rows <= 80, `${rows} /cards/ links on the ranking (want 1..80)`);
    assert.ok(res.body.length < 285_000, `HTML is ${res.body.length} bytes (>285KB - ranking too heavy)`);
  });

  test("currency: ranked prices render through <Price>, not a hardcoded $", () => {
    const src = read("app/market-data/most-expensive-cards/page.js");
    assert.match(src, /<Price\b/, "ranking prices are not rendered via <Price>");
  });
});

// === 5/6/7/8. ranking links feed durable card / set / Pokemon pages ====

describe("6/7/8: every ranking row links a durable card page; set & Pokemon links resolve", () => {
  const P = "/market-data/most-expensive-cards";

  test("every ranked row links to a /cards/[slug]; a sample resolves 200 + indexable", async () => {
    const body = pages[P].res.body;
    const slugs = [...new Set([...body.matchAll(/href="\/cards\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
    assert.ok(slugs.length >= 50, `only ${slugs.length} distinct /cards/ links on the ranking`);
    for (const s of sample(slugs, 20)) {
      const r = await get(`/cards/${s}`);
      assert.equal(r.status, 200, `/cards/${s} -> ${r.status}`);
      assert.ok(!/noindex/.test(parseHtml(r.body).robots ?? ""), `/cards/${s} is noindex`);
    }
  });

  test("set links on the ranking resolve to real /sets pages", async () => {
    const body = pages[P].res.body;
    const slugs = [...new Set([...body.matchAll(/href="\/sets\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
    assert.ok(slugs.length >= 5, `only ${slugs.length} /sets/ links on the ranking`);
    for (const s of sample(slugs, 12)) {
      const r = await get(`/sets/${s}`);
      assert.equal(r.status, 200, `/sets/${s} -> ${r.status}`);
    }
  });

  test("Pokemon links appear only where the species page is real (200 + indexable)", async () => {
    const body = pages[P].res.body;
    const slugs = [...new Set([...body.matchAll(/href="\/pokemon\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
    // there should be some (many top cards are a species) but every one must resolve
    for (const s of sample(slugs, 15)) {
      const r = await get(`/pokemon/${s}`);
      assert.equal(r.status, 200, `/pokemon/${s} -> ${r.status}`);
      assert.ok(!/noindex/.test(parseHtml(r.body).robots ?? ""), `/pokemon/${s} linked but noindex`);
    }
  });
});

// === 11/12. most-listed: honest definition, no popularity claim ========

describe("11/12: most-listed measures active listings, claims nothing more", () => {
  const P = "/market-data/most-listed-cards";

  test("defines the count as active listings, not sellers / popularity / sales", () => {
    const body = pages[P].res.body;
    assert.match(body, /active listings/i);
    assert.ok(!/\bsellers\b/.test(pages[P].parsed.h1s[0] ?? ""), "H1 says 'sellers'");
    // the row badge must not say "sellers"
    assert.ok(!/\d+\s+sellers/i.test(body), "row badge still says 'N sellers'");
    assert.ok(!/most (popular|searched|sold|wanted)/i.test(body), "claims popularity / search / sales volume");
  });

  test("states the snapshot / partial-market nature and links /methodology", () => {
    const body = pages[P].res.body;
    assert.match(body, /snapshot|as of/i);
    assert.match(body, /href="\/methodology"/);
  });

  test("bounded ItemList (<= 100)", () => {
    const lists = ldOfType(pages[P].parsed, "ItemList");
    assert.ok(lists.length >= 1);
    for (const l of lists) {
      const n = (l.itemListElement ?? []).length;
      assert.ok(n > 0 && n <= 100, `ItemList has ${n} entries`);
    }
  });
});

// === 3. /market-data hub: the cite-worthy first-party statistic ========

describe("15: /market-data carries a reproducible first-party composition stat", () => {
  const P = "/market-data";

  test("price-band panel: bands, a median, a snapshot date, explicit raw/ungraded scope", () => {
    const body = pages[P].res.body;
    assert.match(body, /Under \$5/);
    assert.match(body, /\$100 or more/);
    assert.match(body, /[Mm]edian raw market reference/);
    assert.match(body, /USD/); // source currency stated
    assert.match(body, /ungraded/i);
    assert.match(body, /Catalogue snapshot:/i);
    // percentages present
    assert.match(body, /\d+(\.\d+)?%/);
    assert.match(body, /href="\/methodology"/);
  });

  test("hub stat labels do not overclaim 'sellers'", () => {
    assert.ok(!/2\+ sellers/i.test(pages[P].res.body), "hub still says '2+ sellers'");
  });
});
