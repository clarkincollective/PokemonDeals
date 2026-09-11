// Phase 17B - rendered-output contracts (runs against SEO_TEST_BASE_URL or
// the local `next start` the runner boots). Pure-rule and source checks
// are in tests/scanner/seo-17b-foundation.test.mjs.
//
//   card pages   - the worth answer is in the server HTML, states the exact
//                  printing, a real USD figure or an explicit "no reliable
//                  price", printing details, and never a false deal claim
//   /search      - server-rendered guide, canonical /search, ?q= noindex
//   home         - deals primary, "Check a card's price" secondary
//   site-wide    - footer follow row == Organization.sameAs
//   sitemaps     - shard membership excludes noindex, canonical == loc,
//                  lastmod is sparse and not clustered (no fake freshness)

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { get, parseHtml } from "./lib.mjs";

const ORIGIN = "https://pokemondealfinder.com";
const SHARDS = ["cards-high", "cards-mid", "cards-low", "cards-bulk"];
const text = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");
const ldNodes = (html) => {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") { out.push(v); Object.values(v).forEach(walk); }
  };
  for (const b of parseHtml(html).jsonLd) if (b.ok) walk(b.data);
  return out;
};
const worthSection = (html) => {
  const i = html.indexOf('id="card-worth"');
  return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i));
};

const pages = {};
let shardBodies = {};
before(async () => {
  for (const p of ["/cards/charizard-base-set", "/cards/arcanine-base-set-shadowless", "/cards/drilbur-sv05-temporal-forces", "/search", "/search?q=charizard", "/"]) {
    pages[p] = await get(p);
  }
  await Promise.all(SHARDS.map(async (s) => { shardBodies[s] = (await get(`/sitemaps/${s}.xml`)).body; }));
});

test("card: worth answer is server-rendered with the exact printing and a real USD figure (Charizard Base Set)", () => {
  const r = pages["/cards/charizard-base-set"];
  assert.equal(r.status, 200);
  const w = worthSection(r.body);
  assert.ok(w, "no #card-worth section in the server HTML");
  assert.match(text(w), /How much is Charizard #004\/102 from Base Set worth\?/);
  const priced = /data-worth-answer="priced"/.test(w);
  const unavailable = /data-worth-answer="unavailable"/.test(w);
  assert.ok(priced !== unavailable, "exactly one answer state");
  if (priced) {
    assert.match(text(w), /has a market price of about \$[\d,.]+ USD for a raw \(ungraded\), Near Mint copy/);
  } else {
    assert.ok(!/\$\d/.test(text(w).replace(/\$[\d,.]+ USD \(asking/g, "")), "an unavailable answer must not state a market figure");
  }
  assert.match(text(w), /Card number 004\/102/);
  assert.ok(!/1st Edition copies of this card are priced separately/.test(w) || priced, "1st Edition note only alongside a real figure");
});

test("card: variant identity - Shadowless is stated for the Shadowless printing and ONLY there", () => {
  const sh = text(worthSection(pages["/cards/arcanine-base-set-shadowless"].body));
  assert.match(sh, /from Base Set \(Shadowless\) worth\?/);
  assert.match(sh, /Printing Shadowless/);
  const unl = text(worthSection(pages["/cards/charizard-base-set"].body));
  assert.ok(!/Shadowless/.test(unl), "Shadowless leaked onto the unlimited Base Set page");
  for (const r of [pages["/cards/arcanine-base-set-shadowless"], pages["/cards/charizard-base-set"]]) {
    assert.ok(!/Reverse Holo|Unlimited/.test(text(worthSection(r.body))), "an unproven variant word was stated");
  }
});

test("card: a deal-less card says so and makes no false deal claim; a live-deal card states its real listing count", () => {
  for (const p of ["/cards/charizard-base-set", "/cards/arcanine-base-set-shadowless", "/cards/drilbur-sv05-temporal-forces"]) {
    const html = pages[p].body;
    const isHub = /data-worth-live="\d+"/.test(html);
    if (isHub) {
      const n = Number(html.match(/data-worth-live="(\d+)"/)[1]);
      assert.ok(n >= 1);
      assert.match(text(worthSection(html)), new RegExp(`${n} active eBay listings? for this card right now`));
      assert.ok(!/data-card-state="no-live-deal"/.test(html));
    } else {
      assert.match(html, /data-card-state="no-live-deal"/, `${p}: deal-less state missing`);
      assert.match(text(html), /No live deal for this card right now/);
      // every "N live deal(s)" label must carry a positive count
      for (const m of text(html).matchAll(/(\d+) live deals? (on|in) /g)) assert.ok(Number(m[1]) > 0);
    }
  }
});

test("card: bounded internal links - species + set present, related lists capped, no Product/Offer on deal-less pages", () => {
  const html = pages["/cards/charizard-base-set"].body;
  assert.match(html, /href="\/pokemon\/charizard"/);
  assert.match(html, /href="\/sets\/base-set"/);
  const cardLinks = new Set([...html.matchAll(/href="(\/cards\/[^"#?]+)"/g)].map((m) => m[1]));
  assert.ok(cardLinks.size >= 2 && cardLinks.size <= 30, `card-to-card links ${cardLinks.size} not bounded`);
  const types = new Set(ldNodes(html).map((n) => n["@type"]).flat());
  if (/data-card-state="no-live-deal"/.test(html)) {
    for (const t of ["Product", "Offer", "AggregateOffer"]) assert.ok(!types.has(t), `deal-less card carries ${t}`);
  }
});

test("/search: server-rendered price-checker guide, canonical /search, indexable; ?q= stays noindex", () => {
  const r = pages["/search"];
  assert.equal(r.status, 200);
  const p = parseHtml(r.body);
  assert.deepEqual(p.canonicals, [`${ORIGIN}/search`]);
  assert.ok(!p.robots || !/noindex/.test(p.robots));
  const t = text(r.body);
  for (const s of ["What is my Pokemon card worth?", "Identify the exact printing", "collector number", "Read the market price correctly", "Adjust for condition and grading", "Popular price lookups"]) {
    assert.ok(t.includes(s), `/search server HTML lacks "${s}"`);
  }
  const words = text(r.body.slice(r.body.indexOf('id="pc-guide"'))).split(" ").length;
  assert.ok(words > 300, `guide too thin (${words} words)`);
  for (const slug of ["charizard-base-set", "lugia-neo-genesis"]) assert.match(r.body, new RegExp(`href="/cards/${slug}"`));
  const q = parseHtml(pages["/search?q=charizard"].body);
  assert.match(q.robots ?? "", /noindex/);
  assert.deepEqual(q.canonicals, [`${ORIGIN}/search`]);
});

test("home: deals stay primary; 'Check a card's price' is the secondary action to /search", () => {
  const html = pages["/"].body;
  const primary = html.indexOf("discover_deals_clicked");
  const secondary = html.indexOf("price_checker_entry_clicked");
  assert.ok(primary > 0 && secondary > primary);
  assert.match(html.slice(secondary - 400, secondary + 400), /href="\/search"/);
  assert.match(text(html), /Check a card's price/);
});

test("site-wide: footer follow row lists exactly the Organization.sameAs profiles, rel=me, new tab", () => {
  const html = pages["/"].body;
  const org = ldNodes(html).find((n) => n["@type"] === "Organization" && n.sameAs);
  assert.ok(org, "Organization.sameAs missing");
  const footerLinks = [...html.matchAll(/<a[^>]+data-analytics-click="social_follow_clicked"[^>]*>/g)].map((m) => m[0]);
  const hrefs = footerLinks.map((t) => t.match(/href="([^"]+)"/)[1]);
  assert.deepEqual(hrefs, org.sameAs);
  assert.deepEqual(org.sameAs, ["https://www.instagram.com/pokemondealfinder/", "https://x.com/pkmdealfinder"]);
  for (const t of footerLinks) {
    assert.match(t, /rel="me noopener noreferrer"/);
    assert.match(t, /target="_blank"/);
    assert.match(t, /aria-label="Pokemon Deal Finder on [^"]+ \(opens in a new tab\)"/);
  }
  assert.ok(!/tiktok\.com|youtube\.com/i.test(html), "unverified TikTok/YouTube URL rendered");
});

test("sitemaps: lastmod is sparse, dated, never future, and not clustered on one day (no artificial freshness)", () => {
  const today = new Date().toISOString().slice(0, 10);
  let urls = 0;
  const days = new Map();
  for (const s of SHARDS) {
    const b = shardBodies[s];
    urls += (b.match(/<url>/g) ?? []).length;
    for (const m of b.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(m[1] <= today, `future lastmod ${m[1]}`);
      days.set(m[1], (days.get(m[1]) ?? 0) + 1);
    }
  }
  const withLastmod = [...days.values()].reduce((a, b) => a + b, 0);
  assert.ok(urls > 20000, `card shards hold ${urls} URLs`);
  if (withLastmod === 0) return; // lastmod source unavailable: absent, never faked
  assert.ok(withLastmod / urls < 0.6, `${withLastmod}/${urls} cards carry lastmod - the material-change rule should leave most without one`);
  const top = Math.max(...days.values());
  assert.ok(top / withLastmod < 0.4, `one day holds ${top}/${withLastmod} lastmods - looks like a recording artifact`);
  assert.ok(!days.has("2026-09-02") || days.get("2026-09-02") / withLastmod < 0.1, "the 2026-09-02 recording-expansion artifact is back");
});

test("sitemaps: sampled shard URLs are 200, indexable, and self-canonical (loc == canonical)", async () => {
  const locs = SHARDS.flatMap((s) => [...shardBodies[s].matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const step = Math.max(1, Math.floor(locs.length / 8));
  for (let i = 0; i < locs.length; i += step) {
    const u = locs[i];
    const r = await get(u.replace(ORIGIN, ""));
    assert.equal(r.status, 200, `${u} -> ${r.status}`);
    const p = parseHtml(r.body);
    assert.ok(!p.robots || !/noindex/.test(p.robots), `${u} is noindex but in a shard`);
    assert.deepEqual(p.canonicals, [u], `${u} canonical mismatch`);
  }
});
