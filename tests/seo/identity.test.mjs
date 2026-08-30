import { test } from "node:test";
import assert from "node:assert/strict";
import { get, parseHtml } from "./lib.mjs";

// Machine-readable identity + data-freshness layer (app/layout.js +
// app/page.js). Guards against the regressions that layer is meant to
// prevent: a missing / inconsistent Organization, a fabricated sameAs, a
// Person/founder claim, and a hardcoded or render-time freshness date.

const ORIGIN = "https://pokemondealfinder.com";
const ORG_ID = `${ORIGIN}/#organization`;
const WEBSITE_ID = `${ORIGIN}/#website`;

function nodes(parsed) {
  return parsed.jsonLd.flatMap((b) => {
    assert.ok(b.ok, `invalid JSON-LD: ${b.ok ? "" : b.error}`);
    return Array.isArray(b.data) ? b.data : [b.data];
  });
}

// Deep scan for any node of a given @type anywhere in the JSON-LD trees.
function findType(value, type, hits = []) {
  if (Array.isArray(value)) {
    for (const v of value) findType(v, type, hits);
  } else if (value && typeof value === "object") {
    if (value["@type"] === type || (Array.isArray(value["@type"]) && value["@type"].includes(type))) {
      hits.push(value);
    }
    for (const k of Object.keys(value)) findType(value[k], type, hits);
  }
  return hits;
}

const IDENTITY_PAGES = ["/", "/how-it-works", "/methodology", "/about", "/guides/raw-vs-graded-pokemon-cards"];

for (const path of IDENTITY_PAGES) {
  test(`${path}: site-wide Organization entity is present and consistent`, async () => {
    const res = await get(path);
    assert.equal(res.status, 200, `${path} -> HTTP ${res.status}`);
    const orgs = findType(nodes(parseHtml(res.body)), "Organization");
    assert.ok(orgs.length >= 1, `${path}: no Organization JSON-LD`);

    // The canonical org node (the one carrying the real fields, not a
    // bare {"@id": ...} reference).
    const org = orgs.find((o) => o.name || o.url || o.description) ?? orgs[0];
    assert.equal(org["@id"], ORG_ID, `${path}: Organization @id is "${org["@id"]}"`);
    assert.equal(org.url, `${ORIGIN}/`, `${path}: Organization url is "${org.url}"`);
    assert.ok(org.name && /pokemon deal finder/i.test(org.name), `${path}: Organization name "${org.name}"`);

    // No fabricated external profiles - none exist for this brand.
    assert.ok(!("sameAs" in org), `${path}: Organization has a sameAs (${JSON.stringify(org.sameAs)})`);

    // No superlatives / affiliation claims in the description.
    if (org.description) {
      assert.ok(
        !/\b(best|largest|leading|#1|number one|guaranteed)\b/i.test(org.description),
        `${path}: Organization description has a superlative: "${org.description}"`
      );
    }
  });
}

test("no Person / founder entity anywhere in the identity pages' JSON-LD", async () => {
  for (const path of IDENTITY_PAGES) {
    const res = await get(path);
    const all = nodes(parseHtml(res.body));
    assert.equal(findType(all, "Person").length, 0, `${path}: a Person entity is present`);
    for (const n of all) {
      assert.ok(!("founder" in n), `${path}: a node declares "founder"`);
    }
  }
});

test("WebSite entity: stable @id, SearchAction, publisher -> Organization", async () => {
  const res = await get("/");
  const sites = findType(nodes(parseHtml(res.body)), "WebSite");
  assert.ok(sites.length >= 1, "no WebSite JSON-LD on /");
  const site = sites[0];
  assert.equal(site["@id"], WEBSITE_ID, `WebSite @id is "${site["@id"]}"`);
  assert.equal(site.potentialAction?.["@type"], "SearchAction", "WebSite has no SearchAction");
  assert.equal(site.publisher?.["@id"], ORG_ID, `WebSite publisher @id is "${site.publisher?.["@id"]}"`);
});

test("homepage CollectionPage carries a real, dynamic dateModified", async () => {
  const res = await get("/");
  const parsed = parseHtml(res.body);
  const pages = findType(nodes(parsed), "CollectionPage");
  assert.ok(pages.length >= 1, "no CollectionPage JSON-LD on /");
  const dm = pages[0].dateModified;
  assert.ok(dm, "CollectionPage has no dateModified");

  const t = Date.parse(dm);
  assert.ok(Number.isFinite(t), `dateModified "${dm}" is not a parseable date`);

  const now = Date.now();
  // Not the future (render clock skew aside) and not stale/hardcoded:
  // it tracks MAX(deals.last_seen_at), which on a live catalogue is
  // always recent. A hardcoded literal or a forgotten date would fail
  // one side of this window.
  assert.ok(t <= now + 5 * 60 * 1000, `dateModified "${dm}" is in the future`);
  assert.ok(t >= now - 30 * 24 * 60 * 60 * 1000, `dateModified "${dm}" is more than 30 days old - looks hardcoded/stale`);

  // isPartOf ties back to the one WebSite entity, not a re-declared copy.
  assert.equal(pages[0].isPartOf?.["@id"], WEBSITE_ID, `CollectionPage isPartOf @id is "${pages[0].isPartOf?.["@id"]}"`);
});

test("homepage: visible freshness + a live deal count are in the raw HTML", async () => {
  const res = await get("/");
  const text = res.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // Same source (fetchLastScanTime) drives this line and the JSON-LD
  // dateModified above.
  assert.ok(
    /checked .* ago|refreshing automatically/i.test(text),
    "no visible data-freshness line on the homepage"
  );
  assert.ok(/[\d,]+ live deals/i.test(text), "no visible live deal count on the homepage");
});

test("homepage: crawlable text states what the tool does and which markets it covers", async () => {
  const res = await get("/");
  const text = res.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.ok(/scans eBay listings for Pokemon cards/i.test(text), "no plain-language 'what it does' sentence");
  for (const market of ["US", "UK", "Australia", "Canada", "Germany"]) {
    assert.ok(new RegExp(`\\b${market}\\b`).test(text), `homepage does not name the ${market} marketplace`);
  }
});
