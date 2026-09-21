#!/usr/bin/env node
// PRODUCTION SEO / GEO AUDIT (2026-09-21). READ-ONLY over the network.
//
//   node scripts/seo/productionSeoAudit.mjs
//
// Fetches representative production URLs and reports what a machine
// actually receives: status, canonical, robots meta, title/description,
// JSON-LD @types and @ids, and whether the page's core text is in the
// server HTML. The point is to compare PRODUCTION with what the repo
// intends, not to re-read the repo.
const H = "https://pokemondealfinder.com";

const PAGES = [
  ["home", "/"],
  ["deals index", "/deals"],
  ["deal category", "/deals/under-50"],
  ["deal country", "/deals/usa"],
  ["cards index", "/cards"],
  ["sets index", "/sets"],
  ["pokemon index", "/pokemon"],
  ["guides index", "/guides"],
  ["news index", "/news"],
  ["market-data index", "/market-data"],
  ["market-data study", "/market-data/pokemon-reference-price-changes"],
  ["methodology", "/methodology"],
  ["how-it-works", "/how-it-works"],
  ["about", "/about"],
  ["integrity", "/integrity"],
  ["price checker", "/search"],
  ["sealed deals", "/sealed-deals"],
  ["saved (expect noindex)", "/saved"],
];

const strip = (h) =>
  h
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function look(path) {
  const res = await fetch(`${H}${path}`, { redirect: "manual", headers: { "user-agent": "pdf-seo-audit" } });
  const out = { status: res.status, location: res.headers.get("location") };
  if (res.status >= 300 && res.status < 400) return out;
  const html = await res.text();
  out.canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1] ?? null;
  out.robots = html.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/)?.[1] ?? "(none)";
  out.title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? null;
  out.description = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/)?.[1] ?? null;
  out.ogImage = /property="og:image"/.test(html);
  out.h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g) ?? []).length;
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  out.ldBlocks = blocks.length;
  out.types = [];
  out.ids = [];
  out.ldError = null;
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1]);
      for (const node of parsed["@graph"] ?? [parsed]) {
        if (Array.isArray(node)) {
          for (const n of node) {
            out.types.push(n["@type"]);
            if (n["@id"]) out.ids.push(n["@id"]);
          }
        } else {
          out.types.push(node["@type"]);
          if (node["@id"]) out.ids.push(node["@id"]);
        }
      }
    } catch (e) {
      out.ldError = e.message.slice(0, 80);
    }
  }
  out.words = strip(html).split(" ").length;
  out.htmlKb = Math.round(html.length / 1024);
  return out;
}

console.log("Production SEO / GEO audit\n");
console.log(
  `${"page".padEnd(26)}${"st".padEnd(5)}${"robots".padEnd(22)}${"ld".padEnd(4)}${"words".padEnd(7)}types`
);
const results = [];
for (const [label, path] of PAGES) {
  try {
    const r = await look(path);
    results.push([label, path, r]);
    if (r.status >= 300 && r.status < 400) {
      console.log(`${label.padEnd(26)}${String(r.status).padEnd(5)}-> ${r.location}`);
      continue;
    }
    const t = [...new Set(r.types.filter(Boolean))].join(",");
    console.log(
      `${label.padEnd(26)}${String(r.status).padEnd(5)}${String(r.robots).slice(0, 20).padEnd(22)}${String(r.ldBlocks).padEnd(4)}${String(r.words).padEnd(7)}${t}`
    );
    if (r.ldError) console.log(`${" ".repeat(26)}!! JSON-LD parse error: ${r.ldError}`);
  } catch (e) {
    console.log(`${label.padEnd(26)}ERROR ${e.message.slice(0, 60)}`);
  }
}

console.log("\n--- canonical check (canonical must equal the fetched URL) ---");
for (const [label, path, r] of results) {
  if (!r.canonical) {
    if (r.status < 300) console.log(`  ${label.padEnd(26)} NO CANONICAL`);
    continue;
  }
  const want = `${H}${path}`;
  const ok = r.canonical === want || r.canonical === `${want}/` || (path === "/" && r.canonical === `${H}/`);
  if (!ok) console.log(`  ${label.padEnd(26)} ${r.canonical}   (fetched ${want})`);
}

console.log("\n--- title / description lengths ---");
for (const [label, , r] of results) {
  if (!r.title) continue;
  const tl = r.title.length;
  const dl = (r.description ?? "").length;
  const flag = tl > 65 || dl > 160 || dl === 0 ? "  <-- check" : "";
  console.log(`  ${label.padEnd(26)}title ${String(tl).padStart(3)}  desc ${String(dl).padStart(3)}${flag}`);
}
