// Public spelling convention: the site uses the UNACCENTED "Pokemon"
// everywhere it authors copy, metadata or structured data - brand name
// included ("Pokemon Deal Finder", never "Pokémon Deal Finder"). Raw
// upstream listing titles that contain "Pokémon" are data, not our
// output, and are not covered here. Guards Google's site-name signal and
// every generated public string from silently regaining the accent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get, parseHtml, sitemapUrls, sample, pathOf } from "./lib.mjs";

const ACCENTED = /pokémon/i; // "Pokémon" / "pokémon" / "POKÉMON"
const BRAND = "Pokemon Deal Finder";
const ORIGIN = "https://pokemondealfinder.com";

function ogContent(html, prop) {
  const m = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i")
  );
  return m ? (m[0].match(/content=["']([^"']*)["']/i)?.[1] ?? null) : null;
}

function jsonLdNodes(parsed) {
  return parsed.jsonLd.flatMap((b) => {
    assert.ok(b.ok, `invalid JSON-LD: ${b.error}`);
    return Array.isArray(b.data) ? b.data : [b.data];
  });
}

function findType(value, type, hits = []) {
  if (Array.isArray(value)) value.forEach((v) => findType(v, type, hits));
  else if (value && typeof value === "object") {
    const t = value["@type"];
    if (t === type || (Array.isArray(t) && t.includes(type))) hits.push(value);
    for (const k of Object.keys(value)) findType(value[k], type, hits);
  }
  return hits;
}

// every string value anywhere in a JSON structure
function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

// --- 1-3: exact brand name in the machine-readable identity ---------------

test("1. homepage WebSite.name is exactly \"Pokemon Deal Finder\"", async () => {
  const res = await get("/");
  const sites = findType(jsonLdNodes(parseHtml(res.body)), "WebSite");
  assert.ok(sites.length >= 1, "no WebSite JSON-LD on /");
  for (const s of sites) {
    assert.equal(s.name, BRAND, `WebSite.name is "${s.name}"`);
    assert.ok(!("alternateName" in s), `WebSite has an alternateName: ${JSON.stringify(s.alternateName)}`);
  }
});

test("2. homepage Organization.name is exactly \"Pokemon Deal Finder\"", async () => {
  const res = await get("/");
  const orgs = findType(jsonLdNodes(parseHtml(res.body)), "Organization");
  assert.ok(orgs.length >= 1, "no Organization JSON-LD on /");
  const org = orgs.find((o) => o.name || o.url || o.description) ?? orgs[0];
  assert.equal(org.name, BRAND, `Organization.name is "${org.name}"`);
  assert.ok(!("alternateName" in org), `Organization has an alternateName: ${JSON.stringify(org.alternateName)}`);
});

test("3. homepage og:site_name is exactly \"Pokemon Deal Finder\"", async () => {
  const res = await get("/");
  assert.equal(ogContent(res.body, "og:site_name"), BRAND);
});

// --- 4: no accented brand / word anywhere in the homepage identity -------

test("4. the homepage HTML contains no accented \"Pokémon\" (brand or copy)", async () => {
  const res = await get("/");
  assert.ok(!/Pokémon Deal Finder/.test(res.body), "homepage HTML still contains \"Pokémon Deal Finder\"");
  const hits = [...res.body.matchAll(/.{0,40}pokémon.{0,20}/gi)].map((m) => m[0]);
  assert.equal(hits.length, 0, `homepage HTML has accented "Pokémon":\n  ${hits.join("\n  ")}`);
});

// --- 5: representative public metadata emits no accented "Pokémon" -------

test("5. representative public pages emit no accented \"Pokémon\" in title / description / og / JSON-LD / H1", async () => {
  const { byType } = await sitemapUrls();
  const picks = [];
  for (const seg of ["pokemon", "cards", "sets", "deals"]) {
    const urls = byType.get(seg) ?? [];
    for (const u of sample(urls, 2)) picks.push(pathOf(u));
  }
  // ensure a /deals/[id] is covered even if the sitemap omits them
  if (!picks.some((p) => p.startsWith("/deals/"))) {
    const home = parseHtml((await get("/")).body);
    const anyDeal = home.internalLinks.find((l) => /^\/deals\/\d+$/.test(l));
    if (anyDeal) picks.push(anyDeal);
  }
  assert.ok(picks.length >= 4, `too few representative pages sampled: ${picks.join(", ")}`);

  const offenders = [];
  for (const path of picks) {
    const res = await get(path);
    if (res.status !== 200) continue;
    const p = parseHtml(res.body);
    const fields = {
      title: p.title,
      metaDescription: p.metaDescription,
      "og:title": ogContent(res.body, "og:title"),
      "og:description": ogContent(res.body, "og:description"),
      "twitter:title": ogContent(res.body, "twitter:title"),
      h1: p.h1s.join(" | "),
    };
    for (const [k, v] of Object.entries(fields)) {
      if (v && ACCENTED.test(v)) offenders.push(`${path} ${k}: ${v}`);
    }
    for (const s of strings(jsonLdNodes(p))) {
      if (ACCENTED.test(s)) offenders.push(`${path} JSON-LD: ${s}`);
    }
  }
  assert.equal(offenders.length, 0, `accented "Pokémon" in generated public output:\n  ${offenders.join("\n  ")}`);
});

// --- 6: source lock - the brand constant + identity JSON-LD -------------

test("6. app/layout.js defines the brand unaccented and adds no accented alias", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "layout.js"), "utf8");
  assert.match(src, /SITE_TITLE\s*=\s*"Pokemon Deal Finder"/, "SITE_TITLE is not exactly \"Pokemon Deal Finder\"");
  assert.ok(!ACCENTED.test(src), "app/layout.js contains an accented \"Pokémon\"");
  assert.ok(!/alternateName/.test(src), "app/layout.js re-introduces an alternateName on the identity nodes");
});
