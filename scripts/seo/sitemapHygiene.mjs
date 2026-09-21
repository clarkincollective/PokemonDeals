#!/usr/bin/env node
// SITEMAP HYGIENE (2026-09-21). READ-ONLY over the network.
//
//   node scripts/seo/sitemapHygiene.mjs
//   node scripts/seo/sitemapHygiene.mjs --sample=40
//
// A sitemap is a set of claims: "this URL is canonical, indexable and
// worth crawling". This checks the claims against what the URLs actually
// return - status, canonical target, robots meta - and reports every
// contradiction. It also confirms the pages we most want cited (research,
// methodology, integrity, guides) are advertised at all.
const H = "https://pokemondealfinder.com";
const SAMPLE = Number((process.argv.find((a) => a.startsWith("--sample=")) ?? "--sample=25").split("=")[1]);

const text = async (u) => (await fetch(u, { headers: { "user-agent": "pdf-sitemap-hygiene" } })).text();
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const lastmods = (xml) => [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);

const index = await text(`${H}/sitemap.xml`);
const children = locs(index);
console.log(`Sitemap hygiene\n\n  index lists ${children.length} child sitemaps\n`);

const all = new Map(); // url -> child sitemap
let totalLastmod = 0;
for (const child of children) {
  const xml = await text(child);
  const urls = locs(xml);
  const lm = lastmods(xml);
  totalLastmod += lm.length;
  console.log(`  ${child.replace(H, "").padEnd(34)} ${String(urls.length).padStart(5)} urls, ${String(lm.length).padStart(5)} with lastmod`);
  for (const u of urls) {
    if (all.has(u)) console.log(`      !! DUPLICATE across sitemaps: ${u} (also in ${all.get(u)})`);
    all.set(u, child);
  }
}
console.log(`\n  total advertised: ${all.size} unique urls, ${totalLastmod} lastmod values`);

// Structural claims that do not need a fetch.
const bad = [...all.keys()].filter((u) => !u.startsWith(`${H}/`));
const query = [...all.keys()].filter((u) => u.includes("?"));
const frag = [...all.keys()].filter((u) => u.includes("#"));
const trailing = [...all.keys()].filter((u) => u !== `${H}/` && u.endsWith("/"));
console.log(`  off-host: ${bad.length}   with query string: ${query.length}   with fragment: ${frag.length}   trailing slash: ${trailing.length}`);
for (const u of [...bad, ...query, ...frag, ...trailing].slice(0, 5)) console.log(`      ${u}`);

// The pages whose whole purpose is being cited must be advertised.
console.log("\n--- pages we most want cited ---");
const MUST = [
  "/market-data",
  "/market-data/pokemon-reference-price-changes",
  "/market-data/most-expensive-cards",
  "/market-data/most-listed-cards",
  "/market-data/pokemon-card-value-distribution",
  "/methodology",
  "/integrity",
  "/how-it-works",
  "/about",
  "/guides",
  "/news",
  "/search",
];
for (const p of MUST) {
  const present = all.has(`${H}${p}`);
  console.log(`  ${present ? "in sitemap    " : "NOT ADVERTISED"}  ${p}`);
}

// Sample real URLs and check the claims agree.
console.log(`\n--- verifying ${SAMPLE} sampled urls (status / canonical / robots) ---`);
const pool = [...all.keys()];
const step = Math.max(1, Math.floor(pool.length / SAMPLE));
const sample = pool.filter((_, i) => i % step === 0).slice(0, SAMPLE);
let problems = 0;
for (const u of sample) {
  const res = await fetch(u, { redirect: "manual", headers: { "user-agent": "pdf-sitemap-hygiene" } });
  if (res.status !== 200) {
    problems++;
    console.log(`  ${res.status}  ${u}  -> ${res.headers.get("location") ?? ""}`);
    continue;
  }
  const html = await res.text();
  const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1] ?? null;
  const robots = html.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/)?.[1] ?? "";
  if (/noindex/i.test(robots)) {
    problems++;
    console.log(`  NOINDEX but advertised: ${u}`);
  }
  if (canonical && canonical !== u) {
    problems++;
    console.log(`  CANONICAL MISMATCH: ${u}\n      canonical -> ${canonical}`);
  }
  if (!canonical) {
    problems++;
    console.log(`  NO CANONICAL: ${u}`);
  }
}
console.log(`\n  sampled ${sample.length}, contradictions found: ${problems}`);
