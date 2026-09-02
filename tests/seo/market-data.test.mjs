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

const PATHS = [
  "/market-data",
  "/market-data/most-expensive-cards",
  "/market-data/most-listed-cards",
  "/market-data/pokemon-card-value-distribution",
];

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

// === 11/12. most-listed: display-gated count, honest definition ========

describe("11/12: most-listed counts DISPLAYABLE listings, claims nothing more", () => {
  const P = "/market-data/most-listed-cards";

  test("13. defines the count as displayable listings, not sellers / popularity / sales", () => {
    const body = pages[P].res.body.replace(/<!--\s*-->/g, "");
    // Phase 9A closeout: the metric is now currently-displayable listings.
    assert.match(body, /displayable/i, "copy no longer says the count is display-gated");
    assert.match(body, /quality checks the rest of the site uses/i);
    assert.ok(!/\bsellers\b/.test(pages[P].parsed.h1s[0] ?? ""), "H1 says 'sellers'");
    assert.ok(!/\d+\s+sellers/i.test(body), "row badge still says 'N sellers'");
    assert.match(body, /\d+\s*listings/, "row badge does not read 'N listings'");
  });

  test("14. no 'most popular' / search-demand / sales-volume / whole-marketplace claim", () => {
    const body = pages[P].res.body;
    assert.ok(!/most (popular|searched|sold|wanted)/i.test(body), "claims popularity / search / sales volume");
    assert.match(body, /not the whole eBay market/i, "does not disclaim the partial-market scope");
    assert.match(body, /not distinct sellers/i);
  });

  test("15. snapshot label uses a real underlying listing time, not a render-time fake", () => {
    const body = pages[P].res.body;
    // source: the label is fed by fetchMostListedCards' snapshotAt
    // (max(last_seen_at) of the scanned rows), never new Date()/Date.now().
    const src = readFileSync(join(ROOT, "app/market-data/most-listed-cards/page.js"), "utf8");
    assert.match(src, /const \{ cards, snapshotAt \} = await fetchMostListedCards/);
    assert.match(src, /formatScanTime\(snapshotAt\)/);
    assert.ok(!/new Date\(\)|Date\.now\(\)/.test(src), "page derives freshness from the clock");
    // rendered: a parseable past timestamp next to the label
    const m = body.match(/Listing counts as of.*?<time[^>]+dateTime="([^"]+)"/s);
    assert.ok(m, "no <time dateTime> next to the snapshot label");
    const ageMs = Date.now() - new Date(m[1]).getTime();
    assert.ok(ageMs >= 0 && ageMs < 14 * 24 * 3600 * 1000, `snapshot age ${Math.round(ageMs / 86400000)}d out of range`);
    assert.match(body, /href="\/methodology"/);
  });

  test("16. every ranked row links a permanent /cards/[slug]; a sample resolves 200 + indexable; counts are plausible", async () => {
    const body = pages[P].res.body.replace(/<!--\s*-->/g, "");
    const slugs = [...new Set([...body.matchAll(/href="\/cards\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
    assert.ok(slugs.length >= 50, `only ${slugs.length} distinct /cards/ links on the ranking`);
    assert.ok(!/href="\/deals\/\d+"/.test(body), "a ranking row falls back to /deals/[id]");
    // count badges: a real per-card displayable listing count, bounded
    const counts = [...body.matchAll(/>\s*(\d+)\s*listings\s*</g)].map((m) => Number(m[1]));
    assert.ok(counts.length >= 50, `only ${counts.length} count badges`);
    assert.ok(Math.max(...counts) < 500, `implausible listing count ${Math.max(...counts)}`);
    assert.ok(Math.min(...counts) >= 2, `a ranked card shows < 2 listings (${Math.min(...counts)})`);
    for (const s of sample(slugs, 20)) {
      const r = await get(`/cards/${s}`);
      assert.equal(r.status, 200, `/cards/${s} -> ${r.status}`);
      assert.ok(!/noindex/.test(parseHtml(r.body).robots ?? ""), `/cards/${s} is noindex`);
    }
  });

  test("12/18/19: bounded ItemList, self-canonical, indexable (unchanged by the closeout)", () => {
    const { parsed } = pages[P];
    const lists = ldOfType(parsed, "ItemList");
    assert.ok(lists.length >= 1);
    for (const l of lists) {
      const n = (l.itemListElement ?? []).length;
      assert.ok(n > 0 && n <= 100, `ItemList has ${n} entries`);
    }
    assert.equal(pathOf(parsed.canonicals[0]), P);
    assert.ok(!/noindex/.test(parsed.robots ?? ""));
    assert.ok(!/Pokémon/.test(pages[P].res.body), "accented Pokémon");
  });
});

// === 17. the Most Valuable ranking is untouched by this closeout =======

describe("17: Most Valuable page unchanged by the Most-Listed closeout", () => {
  test("still the raw cross-catalogue ranking, still Top <= 100, still catalogue-sourced", () => {
    const src = readFileSync(
      join(ROOT, "app/market-data/most-expensive-cards/page.js"),
      "utf8"
    );
    assert.match(src, /fetchTopCatalogCards\(\{ limit: RANKING_SIZE \}\)/);
    assert.match(src, /Most Valuable Pokemon Cards by Raw Market Value/);
    const { parsed } = pages["/market-data/most-expensive-cards"];
    assert.match(parsed.h1s[0], /Raw Market Value/i);
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

// === SEO Phase 10B: the standalone value-distribution research note =====

describe("10B: Pokemon Card Value Distribution research note", () => {
  const P = "/market-data/pokemon-card-value-distribution";
  const src = read("app/market-data/pokemon-card-value-distribution/page.js");

  const num = (s) => Number(String(s).replace(/[^0-9.]/g, ""));
  // VISIBLE text only: drop <script>/<style> (the RSC flight payload
  // re-serialises the JSX tree and would otherwise leak "not"+" every..."
  // as separate tokens), strip React comment markers + tags, decode the
  // entities React emits -> one whitespace-collapsed string.
  const text = () =>
    pages[P].res.body
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--\s*-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ");

  test("1/2/3: route is 200, indexable, self-canonical", () => {
    const { res, parsed } = pages[P];
    assert.equal(res.status, 200, `HTTP ${res.status}`);
    assert.ok(!/noindex/.test(parsed.robots ?? ""), "noindex");
    assert.equal(pathOf(parsed.canonicals[0]), P, `canonical ${parsed.canonicals[0]}`);
  });

  test("4/5: exactly one sitemap occurrence, no new research/statistics/reports route family", async () => {
    const { locs } = await sitemapUrls();
    const mine = locs.map(pathOf).filter((l) => l === P);
    assert.equal(mine.length, 1, `sitemap has ${mine.length} occurrences of ${P}`);
    for (const l of locs.map(pathOf)) {
      assert.ok(
        !/^\/(research|statistics|reports|insights)\b/.test(l),
        `a new research route family leaked into the sitemap: ${l}`
      );
    }
    assert.ok(P.startsWith("/market-data/"), "not a child of /market-data");
  });

  test("6: stable <title>, no volatile numbers", () => {
    const t = pages[P].parsed.title;
    assert.match(t, /^Pokemon Card Value Distribution\b/);
    assert.ok(!/\d/.test(t), `title carries a number: ${t}`);
  });

  test("7: exactly one H1 that identifies the analysis", () => {
    const h1s = pages[P].parsed.h1s;
    assert.equal(h1s.length, 1);
    assert.match(h1s[0], /^Pokemon Card Value Distribution$/);
  });

  test("8-13: population, bands, median, set/species counts all come from fetchCatalogComposition", () => {
    assert.match(src, /fetchCatalogComposition\(\)/);
    assert.doesNotMatch(src, /from\("card_catalog"\)/, "page runs its own card_catalog query");
    assert.doesNotMatch(src, /market_price/, "page reimplements the price aggregation");
    assert.match(src, /comp\.bands\.find\(\(b\) => b\.key ===/, "bands not keyed off the aggregate");
    assert.match(src, /comp\.pricedCards/);
    assert.match(src, /comp\.medianReference/);
    assert.match(src, /comp\.setCount/);
    assert.match(src, /comp\.speciesCount/);
  });

  test("10/11: band percentages ~sum to 100 and band counts sum to the analysed population", () => {
    const t = text();
    const rows = [...t.matchAll(/(Under \$5|\$5 . \$25|\$25 . \$100|\$100 or more)\s+([\d.]+)%\s+([\d.]+)%\s+([\d,]+)/g)];
    assert.equal(rows.length, 4, `found ${rows.length} band rows, want 4`);
    const pcts = rows.map((r) => num(r[3]));
    const counts = rows.map((r) => num(r[4]));
    const pctSum = pcts.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(pctSum - 100) <= 1.5, `band percentages sum to ${pctSum}`);
    const popMatch = t.match(/of the ([\d,]+) priced English Pokemon cards in our current analysed catalogue/);
    assert.ok(popMatch, "no analysed-population figure in the headline");
    const pop = num(popMatch[1]);
    assert.equal(counts.reduce((a, b) => a + b, 0), pop, `band counts should sum to ${pop}`);
  });

  test("14/15: snapshot is the real card_catalog time, never a render-time fake", () => {
    assert.match(src, /formatDate\(comp\.snapshotAt\)/);
    assert.ok(!/new Date\(\)|Date\.now\(\)/.test(src), "page derives freshness from the clock");
    const m = pages[P].res.body.match(/Catalogue snapshot:\s*<time[^>]+dateTime="([^"]+)"/s);
    assert.ok(m, "no <time dateTime> next to the snapshot label");
    const ageMs = Date.now() - new Date(m[1]).getTime();
    assert.ok(ageMs >= 0 && ageMs < 45 * 24 * 3600 * 1000, `snapshot age ${Math.round(ageMs / 86400000)}d out of range`);
  });

  test("16/17/18/19: raw definition visible; no graded / auction-record / all-cards overclaim", () => {
    const t = text();
    assert.match(t, /raw,? ungraded market reference/i);
    assert.match(t, /not a PSA 10 . BGS . CGC graded price/i);
    assert.match(t, /not a confirmed auction-record sale/i);
    assert.match(t, /not every Pokemon card ever printed/i);
    // every "all/every cards" mention must be a disclaimer ("not ..." close before it)
    for (const m of t.matchAll(/every Pokemon card ever (made|printed)|all Pokemon cards (ever|made|printed)/gi)) {
      const lead = t.slice(Math.max(0, m.index - 12), m.index);
      assert.match(lead, /\bnot\s*$/i, `unqualified all-cards claim near: "...${lead}${m[0]}..."`);
    }
    assert.ok(!/\b(largest|definitive|complete) (pokemon card )?(study|database|history)\b/i.test(t), "definitive/largest/complete overclaim");
    assert.ok(!/PSA\s*10 (value|price)s?\b/i.test(t), "quotes a graded slab value");
  });

  test("20/21: methodology link + citation section present", () => {
    assert.match(pages[P].res.body, /href="\/methodology"/);
    assert.match(text(), /Citing this analysis/);
    assert.match(text(), /Pokemon Deal Finder, .Pokemon Card Value Distribution., catalogue snapshot/);
  });

  test("22/23: chart has visible text values and needs no charting library", () => {
    const t = text();
    for (const label of ["Under $5", "$25", "$100 or more"]) {
      assert.ok(t.includes(label), `chart missing label ${label}`);
    }
    assert.match(t, /Raw market reference distribution of [\d,]+ priced English non-specialty Pokemon cards/);
    assert.doesNotMatch(src, /chart\.js|recharts|\bd3\b|victory|nivo|apexcharts/i);
    assert.match(pages[P].res.body, /<table/);
  });

  test("24/25: no CSV / API / download / Dataset / Product / Offer", () => {
    const body = pages[P].res.body;
    const types = new Set();
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== "object") return;
      if (typeof n["@type"] === "string") types.add(n["@type"]);
      for (const v of Object.values(n)) if (v && typeof v === "object") walk(v);
    };
    for (const b of pages[P].parsed.jsonLd) if (b.ok) walk(b.data);
    assert.ok(!types.has("Dataset"), "Dataset schema present");
    assert.ok(!types.has("Product"), "Product schema present");
    assert.ok(!types.has("Offer"), "Offer schema present");
    assert.ok(types.has("CollectionPage"), "no CollectionPage schema");
    assert.ok(types.has("BreadcrumbList"), "no BreadcrumbList schema");
    assert.doesNotMatch(src, /\.csv|application\/json|createObjectURL|download=/i);
  });

  test("26/27: parent /market-data links the page; homepage does not", async () => {
    const md = parseHtml((await get("/market-data")).body);
    assert.ok(md.internalLinks.some((l) => pathOf(l) === P), "/market-data does not link the research note");
    const home = parseHtml((await get("/")).body);
    assert.ok(!home.internalLinks.some((l) => pathOf(l) === P), "homepage links the research note (should not in 10B)");
  });

  test("29/30: no accented Pokemon; bounded payload; no huge link list", () => {
    const body = pages[P].res.body;
    assert.ok(!/Pokémon/.test(body), "accented Pokémon");
    assert.ok(body.length < 150_000, `HTML is ${body.length} bytes (>150KB)`);
    const links = (body.match(/href="\/[^"]*"/g) ?? []).length;
    assert.ok(links < 60, `${links} internal links on a research note (too many)`);
  });

  test("28: existing market-data pages still self-canonical + indexable", () => {
    for (const p of ["/market-data", "/market-data/most-expensive-cards", "/market-data/most-listed-cards"]) {
      const parsed = pages[p].parsed;
      assert.equal(pathOf(parsed.canonicals[0]), p);
      assert.ok(!/noindex/.test(parsed.robots ?? ""));
    }
  });
});
