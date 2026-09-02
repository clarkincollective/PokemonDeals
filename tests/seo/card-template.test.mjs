// SEO Phase 8A - card-page title / identity alignment.
//
// The permanent /cards/[slug] page now uses ONE stable template
// regardless of current deal state (people search "<card> <number>
// price / value" whether or not a listing is live), the collector
// number is in the title where known, and the number is always in the
// visible SSR identity line (not only in schema).

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { get, parseHtml } from "./lib.mjs";

function text(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// A stable, well-known vintage card that is almost always a live-deal hub
// (2+ listings) and a modern lower-profile card that is usually
// catalogue-only. Either way the template must be the same shape.
const CARDS = ["/cards/charizard-base-set", "/cards/pikachu-base-set", "/cards/blastoise-base-set"];

let results = [];
before(async () => {
  results = await Promise.all(
    CARDS.map(async (p) => {
      const r = await get(p);
      return { p, r, parsed: parseHtml(r.body) };
    })
  );
});

test("1. card title/H1 use the stable 'Price & Value' template, never a deal-state flip", () => {
  for (const { p, r, parsed } of results) {
    if (r.status !== 200) continue;
    // authored part of the <title> (before the site-name suffix)
    const core = (parsed.title ?? "").split(" | ")[0];
    assert.match(core, /Price & Value$/, `${p} title core is not "... Price & Value": ${core}`);
    assert.ok(!/Deals?$/i.test(core), `${p} title still flips to "Deals": ${core}`);
    assert.ok(parsed.h1s[0], `${p} has no H1`);
    assert.match(parsed.h1s[0], /Price & Value$/, `${p} H1 is not "... Price & Value": ${parsed.h1s[0]}`);
  }
});

test("2. card title carries the exact identity - name + set (and number where the name/set imply one)", () => {
  const first = results.find((x) => x.r.status === 200);
  assert.ok(first, "no card page reachable");
  // Charizard Base Set -> the title must contain the name and the set
  const cz = results.find((x) => x.p === "/cards/charizard-base-set" && x.r.status === 200);
  if (cz) {
    const core = cz.parsed.title.split(" | ")[0];
    assert.match(core, /Charizard/);
    assert.match(core, /Base Set/);
    // 4/102 is the Base Set Charizard collector number - present in title OR the visible identity line
    const body = text(cz.r.body);
    assert.ok(/4\/102/.test(core) || /4\/102/.test(body), "Charizard Base Set: collector number 4/102 nowhere on the page");
  }
});

test("3. the collector number is in the VISIBLE SSR identity line, not only in schema", () => {
  for (const { p, r } of results) {
    if (r.status !== 200) continue;
    // strip JSON-LD, then look for a "· <number>" identity fragment near the H1
    const noSchema = r.body.replace(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi, " ");
    const around = noSchema.slice(noSchema.search(/<h1[\s>]/), noSchema.search(/<h1[\s>]/) + 900).replace(/<[^>]+>/g, " ");
    assert.match(
      around,
      /·\s*[A-Za-z]{0,5}\d{1,4}[a-z]?(?:\/\d{1,3})?\b/,
      `${p}: no visible "· <collector number>" near the H1 (identity only in schema?)`
    );
  }
});

test("4. card meta description is stable - no volatile live-listing count", () => {
  for (const { p, r, parsed } of results) {
    if (r.status !== 200) continue;
    const d = parsed.metaDescription ?? "";
    assert.ok(d.length > 0, `${p}: empty description`);
    assert.ok(
      !/\b\d+\s+(?:live\s+)?(?:eBay\s+)?listings?\b/i.test(d),
      `${p}: description has a volatile listing count: ${d}`
    );
  }
});

test("5. canonical + robots unchanged (bare /cards/[slug], indexable when priced)", () => {
  for (const { p, r, parsed } of results) {
    if (r.status !== 200) continue;
    assert.deepEqual(parsed.canonicals, [`https://pokemondealfinder.com${p}`], `${p}: canonical drift`);
    assert.ok(!/noindex/.test(parsed.robots ?? ""), `${p}: unexpectedly noindex`);
  }
});
