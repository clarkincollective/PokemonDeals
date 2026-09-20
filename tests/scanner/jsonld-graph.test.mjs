// Structured-data brief 2026-09-20 - the builders behind every JSON-LD
// block: the home graph resolves internally, survives a JSON round trip,
// lists deals in order with unique absolute URLs, mirrors the FAQ array,
// and nothing anywhere ships a placeholder. Detail-page Offers point at
// this site's own pages, never eBay, and auctions carry no Product.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
const lib = await import(pathToFileURL(resolve(root, "lib/jsonLd.js")).href);
const { buildHomeGraph, serializeJsonLd, unresolvedReferences, IDS, organizationNode, websiteNode, faqPageNode, graph } = lib;

const FAQ = [
  { question: "Is this free to use?", answer: "Yes, always. We earn a small commission." },
  { question: "Do you cover graded cards?", answer: "Yes. A graded listing is compared only with a graded reference." },
];
const sample = () =>
  buildHomeGraph({
    title: "Pokemon Card Deals Below Market Price | Pokemon Deal Finder",
    description: "Live eBay Pokemon card listings priced below a recent-sold market reference.",
    h1: "Pokemon card deals below market price on eBay",
    lastRefreshed: "2026-09-20T01:02:03.000Z",
    deals: [
      { id: 39287, name: "Gengar - EX Legend Maker" },
      { id: 38349, name: "Gyarados (Red) - HeartGold SoulSilver" },
      { id: 40442, name: "Rayquaza GX (Full Art) - SM - Celestial Storm" },
    ],
    liveCount: 1430,
    faqItems: FAQ,
    sameAs: ["https://www.instagram.com/pokemondealfinder/", "https://x.com/pkmdealfinder"],
    article: { headline: "How it works", description: "d", dateModified: "2026-09-20", citation: ["https://pokemondealfinder.com/methodology"] },
  });

test("home graph: one @context, eight nodes with the brief's @ids, every @id reference resolves, JSON round trip", () => {
  const g = sample();
  assert.equal(g["@context"], "https://schema.org");
  assert.deepEqual(
    g["@graph"].map((n) => n["@type"]),
    ["Organization", "WebSite", "ImageObject", "ImageObject", "CollectionPage", "ItemList", "FAQPage", "Article"]
  );
  for (const n of g["@graph"]) assert.ok(!("@context" in n), "no per-node @context inside a graph");
  const ids = new Set(g["@graph"].map((n) => n["@id"]));
  for (const id of Object.values(IDS)) assert.ok(ids.has(id), id);
  assert.deepEqual(unresolvedReferences(g), []);
  const text = serializeJsonLd(g);
  assert.ok(!text.includes("<"), "serializer escapes <");
  assert.deepEqual(JSON.parse(text), g);
});

test("ItemList: render order, sequential positions, unique absolute URLs, numberOfItems = the whole list; omitted with its reference when nothing renders", () => {
  const g = sample();
  const list = g["@graph"].find((n) => n["@type"] === "ItemList");
  assert.equal(list["@id"], IDS.featuredDeals);
  assert.equal(list.numberOfItems, 1430);
  assert.equal(list.url, "https://pokemondealfinder.com/#deals");
  assert.deepEqual(list.itemListElement.map((e) => e.position), [1, 2, 3]);
  const urls = list.itemListElement.map((e) => e.url);
  assert.equal(new Set(urls).size, urls.length);
  for (const u of urls) assert.match(u, /^https:\/\/pokemondealfinder\.com\/deals\/\d+$/);
  assert.equal(list.itemListElement[0].name, "Gengar - EX Legend Maker");
  const page = g["@graph"].find((n) => n["@type"] === "CollectionPage");
  assert.deepEqual(page.mainEntity, { "@id": IDS.featuredDeals });
  assert.equal(page.dateModified, "2026-09-20T01:02:03.000Z");
  assert.equal(page.datePublished, "2026-08-26");
  const empty = buildHomeGraph({ title: "t", description: "d", h1: "h", deals: [], faqItems: FAQ });
  assert.ok(!empty["@graph"].some((n) => n["@type"] === "ItemList"));
  assert.ok(!("mainEntity" in empty["@graph"].find((n) => n["@type"] === "CollectionPage")));
  assert.deepEqual(unresolvedReferences(empty), []);
});

test("FAQPage mirrors the array it is built from; entity nodes carry the brief's fields; no rating, no Person", () => {
  const g = sample();
  const faq = g["@graph"].find((n) => n["@type"] === "FAQPage");
  assert.equal(faq.mainEntity.length, FAQ.length);
  assert.equal(faq.mainEntity[1].name, FAQ[1].question);
  assert.equal(faq.mainEntity[1].acceptedAnswer.text, FAQ[1].answer);
  assert.deepEqual(faq.isPartOf, { "@id": IDS.webpage });
  const org = organizationNode({ sameAs: ["https://x.com/pkmdealfinder"] });
  assert.deepEqual(org.logo, { "@id": IDS.logo });
  assert.deepEqual(org.areaServed, ["US", "GB", "AU", "CA", "DE", "IT"]);
  assert.equal(org.ownershipFundingInfo, "https://pokemondealfinder.com/affiliate-disclosure");
  assert.equal(org.foundingDate, "2026-08-26");
  const site = websiteNode();
  assert.equal(site.alternateName, "pokemondealfinder.com");
  assert.equal(site.potentialAction.target.urlTemplate, "https://pokemondealfinder.com/search?q={search_term_string}");
  const text = JSON.stringify(g);
  assert.doesNotMatch(text, /aggregateRating|"review"|"@type":"Person"/);
  assert.doesNotMatch(text, /ebay\.(com|co\.uk|com\.au|ca|de|it)\//, "no eBay URLs in the home graph");
  assert.equal(graph([{ "@context": "x", "@type": "Thing" }])["@graph"][0]["@context"], undefined);
  assert.equal(faqPageNode([]).mainEntity.length, 0);
});

test("no placeholder strings anywhere in app, components or lib", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(root, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.(js|mjs|json|md)$/.test(rel) && /REPLACE_WITH_|TODO_URL|example\.com\/logo/.test(read(rel))) offenders.push(rel);
    }
  };
  for (const d of ["app", "components", "lib"]) walk(d);
  assert.deepEqual(offenders, []);
});

test("detail pages: Offer url is the page's own canonical URL, price is the item price, auctions carry no Product, condition or grade is a named property", () => {
  const deal = read("app/deals/[id]/page.js");
  assert.match(deal, /url: `\$\{SITE_URL\}\/deals\/\$\{deal\.id\}`,\s*priceCurrency: nativeCurrency,\s*price: Number\(deal\.price\)\.toFixed\(2\),/);
  assert.match(deal, /\{showSavings && !isAuction && hasPrice\(deal\.price\) && \(\s*<script/, "no Product for auctions");
  assert.match(deal, /propertyValue\("Grade", `\$\{String\(deal\.grader\)\.toUpperCase\(\)\} \$\{deal\.grade\}`\)/);
  assert.match(deal, /propertyValue\("Card condition", conditionLabel\(deal\)\)/);
  assert.match(deal, /data-item-price>\s*Item price/, "the item price is visible when shipping was recorded");
  assert.doesNotMatch(deal.slice(deal.indexOf("const productJsonLd"), deal.indexOf("const breadcrumbJsonLd")), /listing_url|affiliate_url/);
  const card = read("app/cards/[slug]/page.js");
  assert.match(card, /if \(deal\.listing_type === "AUCTION"\) return \[\];\s*if \(!hasPrice\(deal\.total_price\) \|\| !hasPrice\(deal\.price\)\) return \[\];/);
  assert.match(card, /url: `\$\{SITE_URL\}\/deals\/\$\{deal\.id\}`,\s*priceCurrency: currencyForDeal\(deal\),\s*price: Number\(deal\.price\)\.toFixed\(2\),/);
  const sealed = read("app/sealed-deals/[id]/page.js");
  assert.match(sealed, /url: `\$\{SITE_URL\}\/sealed-deals\/\$\{deal\.id\}`/);
  assert.match(sealed, /price: Number\(deal\.price\)\.toFixed\(2\)/);
  assert.match(sealed, /showSavings && !isAuction && hasPrice\(deal\.price\) && <script/);
  assert.match(read("components/DealCard.js"), /\{" · "\}item <Price usd=\{usdTotal - shippingUsd\}/, "the card grid states the item figure beside the recorded shipping");
});
