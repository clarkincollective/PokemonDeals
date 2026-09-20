#!/usr/bin/env node
// Structured-data smoke (brief 2026-09-20): fetch rendered production HTML
// and assert what each page's JSON-LD must and must not contain. Network;
// run after a deploy, not in the ratchet.
//
//   node scripts/seo/jsonLdSmoke.mjs [--deal=<id>] [--auction=<id>] [--ended=<id>] [--card=<slug>] [--print]
//
// Checks: exactly one ld+json block on the home page (one @graph); the
// expected types present or absent per page; an Offer's price string
// appears in the page's visible text; no eBay URL inside any Product.
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const H = "https://pokemondealfinder.com";
const PRINT = "print" in args;
let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("  x " + msg); } else console.log("  + " + msg); };

async function page(path) {
  const res = await fetch(`${H}${path}`, { headers: { "cache-control": "no-cache", "user-agent": "pdf-jsonld-smoke" } });
  const html = await res.text();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const nodes = blocks.flatMap((b) => (b["@graph"] ? b["@graph"] : [b]));
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  return { status: res.status, html, blocks, nodes, text };
}
const types = (p) => p.nodes.map((n) => n["@type"]);
const noEbay = (p) => !/ebay\.(com|co\.uk|com\.au|ca|de|it)\//.test(JSON.stringify(p.nodes.filter((n) => n["@type"] === "Product")));
const priceVisible = (p, offer) => {
  const price = String(offer.price);
  const [whole, frac] = price.split(".");
  const grouped = Number(whole).toLocaleString("en-US") + (frac ? `.${frac}` : "");
  return p.text.includes(price) || p.text.includes(grouped);
};

console.log("== home /");
const home = await page("/");
ok(home.status === 200, `status ${home.status}`);
ok(home.blocks.length === 1, `exactly one ld+json block (${home.blocks.length})`);
ok(home.blocks[0]?.["@graph"]?.length > 0, "one @graph");
const homeTypes = types(home);
for (const t of ["Organization", "WebSite", "CollectionPage", "FAQPage", "ImageObject"]) ok(homeTypes.includes(t), `${t} present`);
ok(!homeTypes.includes("Product"), "no Product on the home page");
const list = home.nodes.find((n) => n["@type"] === "ItemList");
ok(!list || list.itemListElement.every((e, i) => e.position === i + 1 && /^https:\/\/pokemondealfinder\.com\/deals\/\d+$/.test(e.url)), "ItemList positions sequential, URLs absolute");
if (PRINT) console.log(JSON.stringify(home.blocks[0], null, 2));

if (args.deal) {
  console.log(`== live fixed-price deal /deals/${args.deal}`);
  const d = await page(`/deals/${args.deal}`);
  ok(d.status === 200, `status ${d.status}`);
  ok(!types(d).includes("Organization") && !types(d).includes("WebSite"), "no site entities on inner pages");
  const product = d.nodes.find((n) => n["@type"] === "Product");
  ok(Boolean(product), "Product present");
  if (product) {
    ok(product.offers?.["@type"] === "Offer", "Offer present");
    ok(product.offers?.url === `${H}/deals/${args.deal}`, "Offer.url is the canonical page");
    ok(priceVisible(d, product.offers), `Offer.price ${product.offers?.price} visible in page text`);
    ok(noEbay(d), "no eBay URL inside the Product");
    ok(!JSON.stringify(product).includes("aggregateRating"), "no aggregateRating");
  }
  ok(types(d).includes("BreadcrumbList"), "BreadcrumbList present");
  if (PRINT) console.log(JSON.stringify(d.blocks, null, 2));
}
if (args.auction) {
  console.log(`== auction /deals/${args.auction}`);
  const a = await page(`/deals/${args.auction}`);
  ok(a.status === 200, `status ${a.status}`);
  ok(!types(a).includes("Product"), "no Product on an auction page");
}
if (args.ended) {
  console.log(`== ended /deals/${args.ended}`);
  // an expired deal 308s to its card page (or 404s) before any schema is
  // emitted - do not follow the redirect, or the card page's Product would
  // be read as the ended page's
  const res = await fetch(`${H}/deals/${args.ended}`, { redirect: "manual", headers: { "cache-control": "no-cache", "user-agent": "pdf-jsonld-smoke" } });
  if (res.status === 308 || res.status === 301 || res.status === 404) {
    ok(true, `ended page answers ${res.status}${res.headers.get("location") ? " -> " + res.headers.get("location") : ""} (no schema emitted)`);
  } else {
    const e = await page(`/deals/${args.ended}`);
    ok(!types(e).includes("Product"), `no Product on an ended page (status ${e.status})`);
  }
}
if (args.card) {
  console.log(`== card /cards/${args.card}`);
  const c = await page(`/cards/${args.card}`);
  ok(c.status === 200, `status ${c.status}`);
  const product = c.nodes.find((n) => n["@type"] === "Product");
  ok(Boolean(product), "Product present");
  if (product) {
    const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
    ok(offers.length > 0, `${offers.length} Offer(s)`);
    ok(offers.every((o) => /^https:\/\/pokemondealfinder\.com\/deals\/\d+$/.test(o.url)), "every Offer.url is a deal page on this site");
    ok(noEbay(c), "no eBay URL inside the Product");
  }
  ok(types(c).includes("BreadcrumbList"), "BreadcrumbList present");
  if (PRINT) console.log(JSON.stringify(c.blocks, null, 2));
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
