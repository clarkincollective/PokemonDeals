// SEO-3 - value-band card sitemap shards + truthful lastmod (live).
//   - the index lists the four card shards (and no flat cards.xml)
//   - each shard is a valid urlset under protocol limits
//   - every /cards/ URL appears in exactly one shard; the union is the
//     same ~23k eligible-card set; no bare /cards, no query strings
//   - <lastmod> is date-only, never future, and absent rather than faked
//   - non-card children are untouched; card pages themselves unchanged

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { BASE, get, parseHtml, pathOf, sample } from "./lib.mjs";

const SHARDS = ["cards-high", "cards-mid", "cards-low", "cards-bulk"];
const ORIGIN = "https://pokemondealfinder.com";
const today = new Date().toISOString().slice(0, 10);

let index, bodies = {};
before(async () => {
  index = await get("/sitemap.xml");
  await Promise.all(SHARDS.map(async (s) => { bodies[s] = await get(`/sitemaps/${s}.xml`); }));
});

const locs = (body) => [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

test("1. sitemap index lists the four card shards, the retired flat child is gone, non-card children remain", () => {
  assert.equal(index.status, 200);
  for (const s of SHARDS) assert.match(index.body, new RegExp(`<loc>${ORIGIN}/sitemaps/${s}\\.xml</loc>`), `index missing ${s}`);
  for (const s of ["pages", "sets", "pokemon", "deals", "sealed-deals"]) assert.match(index.body, new RegExp(`<loc>${ORIGIN}/sitemaps/${s}\\.xml</loc>`), `index lost ${s}`);
  assert.ok(!/\/sitemaps\/cards\.xml</.test(index.body), "flat cards.xml still listed");
  assert.equal((index.body.match(/<sitemap>/g) ?? []).length, 9);
  assert.ok(!/<lastmod>/.test(index.body), "index must not carry a fabricated child lastmod");
});

test("2. the retired /sitemaps/cards.xml is no longer served (404), each shard is XML", async () => {
  const old = await get("/sitemaps/cards.xml");
  assert.equal(old.status, 404);
  for (const s of SHARDS) {
    const r = bodies[s];
    assert.equal(r.status, 200, `${s} -> ${r.status}`);
    assert.match(r.contentType, /xml/i, `${s} content-type ${r.contentType}`);
    // an optional single snapshot-identity comment may sit between the XML
    // declaration and the urlset (SEO-3.1)
    assert.match(r.body, /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*(<!-- card-sitemap snapshot [0-9a-f]{16} lastmod-source (rpc|unavailable) -->\s*)?<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.match(r.body, /<\/urlset>\s*$/);
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/.test(r.body), `${s} has a raw ampersand`);
  }
});

test("3. every card URL is in exactly one shard; the union is the eligible-card set; limits respected", () => {
  const all = [];
  for (const s of SHARDS) {
    const l = locs(bodies[s].body);
    assert.ok(l.length < 50000, `${s} exceeds the 50k protocol limit`);
    assert.ok(Buffer.byteLength(bodies[s].body) < 50 * 1024 * 1024, `${s} exceeds 50 MB`);
    for (const u of l) {
      assert.match(u, new RegExp(`^${ORIGIN}/cards/[^/?#]+$`), `${s}: non-card or parameterised URL ${u}`);
      assert.notEqual(pathOf(u), "/cards", `${s}: bare /cards leaked`);
      all.push(u);
    }
  }
  const set = new Set(all);
  assert.equal(set.size, all.length, `duplicate card URLs across shards: ${all.length - set.size}`);
  assert.ok(all.length >= 20000 && all.length <= 30000, `card union ${all.length} outside the expected ~23k band`);
  // the high shard is the smallest cohort, bulk the largest (value distribution)
  assert.ok(locs(bodies["cards-high"].body).length < locs(bodies["cards-bulk"].body).length);
});

test("4. <lastmod> in card shards is a W3C date, never future, never a single stamped value; absent when unknown", () => {
  for (const s of SHARDS) {
    const lm = [...bodies[s].body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    for (const v of lm) {
      assert.match(v, /^\d{4}-\d{2}-\d{2}$/, `${s}: lastmod not a date: ${v}`);
      assert.ok(!Number.isNaN(Date.parse(`${v}T00:00:00Z`)), `${s}: invalid date ${v}`);
      assert.ok(v <= today, `${s}: future lastmod ${v}`);
    }
    if (lm.length > 100) assert.ok(new Set(lm).size > 1, `${s}: every lastmod identical (${lm[0]}) - stamped, not observed`);
    // never more lastmods than URLs, and every <url> has a <loc>
    const urls = (bodies[s].body.match(/<url>/g) ?? []).length;
    assert.equal(urls, locs(bodies[s].body).length, `${s}: a <url> without <loc>`);
    assert.ok(lm.length <= urls);
  }
});

test("5. sampled shard URLs are 200, self-canonical, indexable and unchanged card pages (SEO-2 title/H1 intact)", async () => {
  for (const s of SHARDS) {
    for (const u of sample(locs(bodies[s].body), 3)) {
      const r = await get(pathOf(u));
      assert.equal(r.status, 200, `${u} -> ${r.status}`);
      const p = parseHtml(r.body);
      assert.deepEqual(p.canonicals, [u], `${u} canonical drift`);
      assert.ok(!/noindex/.test(p.robots ?? ""), `${u} is noindex but in ${s}`);
      assert.match(p.h1s[0] ?? "", /Price & Value$/, `${u} H1 changed: ${p.h1s[0]}`);
    }
  }
});

test("7. all four card shards carry the SAME snapshot id (one dataset generation) and the short card edge-cache policy", async () => {
  const ids = new Set();
  for (const s of SHARDS) {
    const m = bodies[s].body.match(/<!-- card-sitemap snapshot ([0-9a-f]{16}) lastmod-source (rpc|unavailable) -->/);
    assert.ok(m, `${s}: no snapshot identity comment`);
    ids.add(m[1]);
    const res = await fetch(`${BASE}/sitemaps/${s}.xml`, { method: "HEAD" }).catch(() => null);
    const cc = res?.headers.get("cache-control") ?? "";
    // `next start` passes the route's header through verbatim. Vercel's CDN
    // CONSUMES s-maxage / stale-while-revalidate (it caches the response at
    // the edge for 300s) and rewrites the client-facing header to
    // "public, max-age=0" - verified live 2026-09-11 (X-Vercel-Cache: HIT,
    // Age rising). Either form is the intended short edge-cache policy.
    if (res?.headers.has("x-vercel-cache")) {
      assert.equal(cc, "public, max-age=0", `${s}: cache-control ${cc}`);
    } else {
      assert.equal(cc, "public, max-age=0, s-maxage=300, stale-while-revalidate=300", `${s}: cache-control ${cc}`);
    }
  }
  assert.equal(ids.size, 1, `card shards were served from ${ids.size} different snapshots: ${[...ids].join(", ")}`);
});

test("6. non-card children are unchanged in shape (no lastmod on stable segments, real lastmod on deals)", async () => {
  for (const s of ["pages", "sets", "pokemon"]) {
    const r = await get(`/sitemaps/${s}.xml`);
    assert.equal(r.status, 200);
    assert.ok(!/<lastmod>/.test(r.body), `${s} gained a lastmod`);
    assert.ok(locs(r.body).length > 0);
  }
  const d = await get("/sitemaps/deals.xml");
  assert.equal(d.status, 200);
  assert.ok(/<lastmod>\d{4}-\d{2}-\d{2}T/.test(d.body), "deals lastmod is no longer an ISO datetime");
});
