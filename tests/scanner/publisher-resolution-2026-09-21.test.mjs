// 2026-09-21 GEO/SEO audit. A JSON-LD reference like
//   "publisher": { "@id": "https://pokemondealfinder.com/#organization" }
// is only meaningful if some node in the SAME document defines that @id.
// The Organization was defined on the home page and nowhere else, so on
// /about, /contact, /how-it-works, /methodology, every guide and every
// Dataset page (/market-data/*, /integrity) the publisher, author and
// creator references all pointed at nothing.
//
// That is backwards for exactly the pages whose worth is attributable
// authorship: the methodology, the integrity report and the original
// market-data research.
//
// lib/jsonLd already shipped `unresolvedReferences()`; the audit found it
// was only ever applied to the home graph. This applies the same rule, by
// source inspection, to every page that makes the reference.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const SKIP = new Set(["node_modules", ".next", ".git", ".local", "dist", "tests", "scripts", "docs"]);

function sources(dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (name.endsWith(".js") || name.endsWith(".jsx")) out.push(p);
  }
  return out;
}

// A file "references" the organization when it points publisher/author/
// creator at the id; it "defines" it when it emits the node builder (or,
// for lib/jsonLd itself, declares the id).
const REFERENCES = /(?:publisher|author|creator)\s*:\s*\{\s*"@id"\s*:\s*`?\$?\{?\s*(?:SITE_URL|IDS)/;
const DEFINES = /publisherNode\s*\(|organizationNode\s*\(|buildHomeGraph\s*\(/;

test("every page that names the Organization as publisher also defines it", () => {
  const offenders = [];
  for (const file of sources()) {
    const rel = relative(root, file).replace(/\\/g, "/");
    if (rel === "lib/jsonLd.js") continue; // the builder itself
    const src = readFileSync(file, "utf8");
    if (!REFERENCES.test(src)) continue;
    if (!DEFINES.test(src)) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    "these emit a publisher/author/creator @id with no node defining it, so the attribution resolves to nothing:\n  " +
      offenders.join("\n  ")
  );
});

test("the Organization node the inner pages emit is the SAME identity as the home page", () => {
  // One coherent identity, not a second thinner one: publisherNode must
  // delegate to organizationNode rather than hand-rolling a stub.
  const src = readFileSync(join(root, "lib/jsonLd.js"), "utf8");
  const fn = src.slice(src.indexOf("export function publisherNode"), src.indexOf("export function websiteNode"));
  assert.match(fn, /return organizationNode\(\{ sameAs \}\)/, "publisherNode must reuse organizationNode");
});

test("publisherNode carries the verified sameAs list, not an empty one", () => {
  // Organization.sameAs is how a machine ties the site to its verified
  // profiles. Passing nothing would emit an identity weaker than the home
  // page's for the very pages that need attributing.
  for (const rel of [
    "components/GuideLayout.js",
    "app/methodology/page.js",
    "app/integrity/page.js",
    "app/market-data/pokemon-reference-price-changes/page.js",
  ]) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.match(src, /publisherNode\(organizationSameAs\(\)\)/, `${rel} must pass the verified profiles`);
  }
});
