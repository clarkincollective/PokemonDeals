// Phase 17B - SEO foundation + first growth wave: pure rules and static
// source contracts (no network). The rendered-output checks live in
// tests/seo/seo17b-growth-wave.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import {
  cardWorthAnswer, printingDetails, isUsableUsdPrice, formatUpdatedOn, pageShowsGraded, WORTH_SENTINEL_PRICES,
} from "../../lib/cardWorth.js";
import { cardNextSteps, priceCategoryFor, eraCategoryFor } from "../../lib/cardNextSteps.js";
import { SOCIAL_PROFILES, organizationSameAs } from "../../lib/socialProfiles.js";
import { pageTypeFromPath, PAGE_TYPES } from "../../lib/analytics/pageType.js";
import { EVENTS, ALLOWED_EVENTS } from "../../lib/analytics/events.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const NOW = Date.parse("2026-09-11T12:00:00Z");

// ---------------------------------------------------------------- worth

const charizard = {
  name: "Charizard", set: "Base Set", cardNumber: "004/102", rarity: "Holo Rare",
  marketUsd: 897.19, priceSource: "analysis", priceUpdatedAt: "2026-09-10T08:00:00Z",
  // price-condition provenance: this fixture's figure IS a Near Mint entry
  referenceCondition: "Near Mint",
};

test("2/5/6. worth answer uses the exact printing identity: name, collector number once, set", () => {
  const a = cardWorthAnswer({ ...charizard, nowMs: NOW });
  assert.equal(a.question, "How much is Charizard #004/102 from Base Set worth?");
  assert.equal(a.identity, "Charizard #004/102");
  assert.equal(a.set, "Base Set");
  assert.equal(a.printing.cardNumber, "004/102");
  assert.equal((a.question.match(/004\/102/g) ?? []).length, 1, "collector number exactly once");
  // a name that already carries the number is not doubled (catalogCardIdentity)
  assert.equal(cardWorthAnswer({ name: "Charizard - 4/102", set: "Base Set", cardNumber: "004/102", marketUsd: 1 }).question.match(/4\/102/g).length, 1);
  // no number stored -> no number invented
  const n = cardWorthAnswer({ name: "Pikachu", set: "Wizards Black Star Promos", cardNumber: null, marketUsd: 5 });
  assert.equal(n.printing.cardNumber, null);
  assert.equal(n.question, "How much is Pikachu from Wizards Black Star Promos worth?");
});

test("3. worth answer states exactly the market figure it is given, in USD, with its condition and source", () => {
  const a = cardWorthAnswer({ ...charizard, nowMs: NOW });
  assert.equal(a.status, "priced");
  assert.equal(a.marketUsd, 897.19);
  assert.equal(a.marketText, "$897 USD"); // >= $100: whole dollars
  assert.equal(cardWorthAnswer({ ...charizard, marketUsd: 12.5 }).marketText, "$12.50 USD");
  assert.equal(cardWorthAnswer({ ...charizard, marketUsd: 1234.4 }).marketText, "$1,234 USD");
  assert.equal(a.condition, "raw (ungraded), Near Mint");
  assert.equal(a.updatedOn, "September 10, 2026");
  // the catalogue fallback claims no freshness date
  assert.equal(cardWorthAnswer({ ...charizard, priceSource: "catalog" }).updatedOn, null);
  // a future provider timestamp is dropped, never shown
  assert.equal(formatUpdatedOn("2026-12-01T00:00:00Z", NOW), null);
  assert.equal(formatUpdatedOn("garbage", NOW), null);
});

test("3. both /cards render paths feed the worth answer the SAME raw figure the Price & value box shows", () => {
  const hub = read("app/cards/[slug]/page.js");
  assert.match(hub, /const hubRaw = analysis\?\.raw\?\.currentPrice;/);
  assert.match(hub, /marketUsd: isUsableUsdPrice\(hubRaw\) \? Number\(hubRaw\) : null/);
  const cat = read("components/CatalogCardView.js");
  // same precedence as the visible box: analysis raw; catalogue copy ONLY when the analysis call failed
  assert.match(cat, /const worthUsd = analysisHasPrice\s*\?\s*\(isUsableUsdPrice\(analysisRaw\) \? Number\(analysisRaw\) : null\)\s*:\s*analysis == null && isUsableUsdPrice\(refPrice\)/);
  assert.match(read("components/CardPriceSummary.js"), /const rawNmValue = analysis\?\.raw\?\.currentPrice \?\? null;/);
});

test("4. an unavailable price never produces a figure (null, 0, NaN, sentinel, negative)", () => {
  for (const v of [null, undefined, 0, -5, NaN, "abc", "", true, ...WORTH_SENTINEL_PRICES]) {
    const a = cardWorthAnswer({ ...charizard, marketUsd: v });
    assert.equal(a.status, "unavailable", `value ${v}`);
    assert.equal(a.marketUsd, undefined);
    assert.equal(a.marketText, undefined);
    assert.ok(!/\$/.test(JSON.stringify(a)), `a $ figure leaked for ${v}`);
  }
  const src = read("components/CardWorthAnswer.js");
  const unavailable = src.slice(src.indexOf('data-worth-answer="unavailable"'), src.indexOf("{live ?"));
  assert.ok(!/marketText|marketUsd/.test(unavailable), "the unavailable branch must not reference a price");
  // sentinel list pinned to the provider module's
  assert.match(read("lib/pokemonPriceTracker.js"), /const SENTINEL_PRICES = new Set\(\[999, 999\.99, 9999, 9999\.99, 99999, 99999\.99\]\)/);
  assert.deepEqual([...WORTH_SENTINEL_PRICES], [999, 999.99, 9999, 9999.99, 99999, 99999.99]);
  assert.equal(isUsableUsdPrice("12.5"), true);
});

test("7. variant modifiers appear only when the stored data proves them", () => {
  // Shadowless is proven by the catalogue SET (TCGplayer models it as its own set)
  assert.deepEqual(printingDetails({ name: "Arcanine", set: "Base Set (Shadowless)", rarity: "Uncommon", cardNumber: "023/102" }).notes, ["Shadowless"]);
  // ...and never inferred for the unlimited Base Set, whatever the era
  assert.deepEqual(printingDetails({ name: "Arcanine", set: "Base Set", rarity: "Uncommon" }).notes, []);
  // name parentheticals are stored printing notes; the collector-number parenthetical is identity, not a variant
  assert.deepEqual(printingDetails({ name: "Pikachu (Cosmos Holo)", set: "SV: Scarlet & Violet Promo Cards" }).notes, ["Cosmos Holo"]);
  assert.deepEqual(printingDetails({ name: "Charizard GX (Shiny) (#SV49)", set: "Hidden Fates: Shiny Vault" }).notes, ["Shiny"]);
  assert.deepEqual(printingDetails({ name: "Poffin (North America International Championship) [Staff]", set: "x" }).notes, ["North America International Championship", "Staff"]);
  // 1st Edition / Reverse Holo / year are never produced from a name or era
  const vintage = printingDetails({ name: "Charizard", set: "Base Set", rarity: "Holo Rare", cardNumber: "004/102" });
  assert.ok(!JSON.stringify(vintage).match(/1st|first edition|reverse|unlimited|19\d\d/i));
  // promo: stored rarity or promo set
  assert.equal(printingDetails({ name: "Pikachu", set: "SM Promos" }).promo, true);
  assert.equal(printingDetails({ name: "Pikachu", set: "Jungle", rarity: "Promo" }).promo, true);
  assert.equal(printingDetails({ name: "Pikachu", set: "Jungle", rarity: "Common" }).promo, false);
  // unknown rarity placeholders are not attributes
  assert.equal(printingDetails({ name: "x", set: "y", rarity: "None" }).rarity, null);
  assert.equal(printingDetails({ name: "x", set: "y", rarity: "Unconfirmed" }).rarity, null);
  // 1st-Edition exclusion is a PROVIDER fact, passed through, never inferred
  assert.equal(cardWorthAnswer({ ...charizard }).firstEditionExcluded, false);
  assert.equal(cardWorthAnswer({ ...charizard, firstEditionExcluded: true }).firstEditionExcluded, true);
  const ppt = read("lib/pokemonPriceTracker.js");
  assert.match(ppt, /firstEditionExcluded:\s*\/1st\\s\*edition\/i\.test\(d\.prices\?\.primaryPrinting \?\? ""\) &&\s*Object\.keys\(d\.prices\?\.variants \?\? \{\}\)\.some\(\(v\) => !\/1st\\s\*edition\/i\.test\(v\)\)/);
  assert.match(ppt, /priceUpdatedAt: d\.prices\?\.lastUpdated \?\? null/);
});

test("worth: graded mention mirrors exactly what CardPriceSummary displays", () => {
  assert.equal(pageShowsGraded({ raw: { currentPrice: 100 }, graded: [{ currentPrice: 400, saleCount: 3 }] }), true);
  assert.equal(pageShowsGraded({ raw: { currentPrice: 100 }, graded: [{ currentPrice: 50, saleCount: 3 }] }), false, "below raw NM is hidden by the summary");
  assert.equal(pageShowsGraded({ raw: { currentPrice: 100 }, graded: [{ currentPrice: 400, saleCount: 0 }] }), false);
  assert.equal(pageShowsGraded(null), false);
});

test("1. the worth answer is server-rendered on BOTH /cards render paths (no client boundary)", () => {
  const comp = read("components/CardWorthAnswer.js");
  assert.ok(!/^\s*["']use client["']/m.test(comp), "CardWorthAnswer must be a server component");
  assert.match(read("app/cards/[slug]/page.js"), /<CardWorthAnswer answer=\{worth\} \/>/);
  assert.match(read("components/CatalogCardView.js"), /<CardWorthAnswer answer=\{worth\} \/>/);
  assert.match(comp, /<h2 id="card-worth-q"[^>]*>\s*\{answer\.question\}/);
});

// ----------------------------------------------------------- next steps

test("12. card internal-link modules are bounded", () => {
  const many = cardNextSteps({
    species: { name: "Charizard", slug: "charizard" }, speciesLive: 40,
    set: { name: "Base Set", slug: "base-set" }, setLive: 12, marketUsd: 20, setName: "Base Set",
  });
  assert.ok(many.length <= 4);
  assert.match(read("lib/deals.js"), /const RELATED_PER_GROUP = 8;/, "related printings / same-set lists stay capped at 8 each");
});

test("13/14. species and set links point at the canonical /pokemon/<slug> and /sets/<slug> pages", () => {
  const l = cardNextSteps({ species: { name: "Mr. Mime", slug: "mr-mime" }, set: { name: "Jungle", slug: "jungle" }, setName: "Jungle" });
  assert.equal(l.find((x) => x.key === "species").href, "/pokemon/mr-mime");
  assert.equal(l.find((x) => x.key === "set").href, "/sets/jungle");
  // no set page -> no set link (never a 404 link)
  assert.ok(!cardNextSteps({ species: null, set: null, setName: "Jungle" }).some((x) => x.key === "set"));
  assert.ok(!cardNextSteps({ species: null }).some((x) => x.key === "species"));
});

test("15. deal-less state makes no false deal claim: 'live deals' only with a real count > 0", () => {
  for (const n of [null, undefined, 0, -1, "x"]) {
    const l = cardNextSteps({ species: { name: "Luvdisc", slug: "luvdisc" }, speciesLive: n, set: { name: "Jungle", slug: "jungle" }, setLive: n });
    for (const x of l) assert.ok(!/live/i.test(x.label), `"${x.label}" implies live deals for count ${n}`);
  }
  const live = cardNextSteps({ species: { name: "Pikachu", slug: "pikachu" }, speciesLive: 1, set: { name: "Jungle", slug: "jungle" }, setLive: 7 });
  assert.equal(live[0].label, "1 live deal on Pikachu cards");
  assert.equal(live[1].label, "7 live deals in Jungle");
  // the no-deal module says so plainly and labels the eBay search as unchecked
  const mod = read("components/CardNextSteps.js");
  assert.match(mod, /No live deal for this card right now/);
  assert.match(mod, /all listings, not checked against market price/);
  assert.match(mod, /rel="sponsored noopener noreferrer"|EbaySearchLink/);
  // the catalogue view no longer claims anything about listings beyond that
  assert.ok(!/No active below-market eBay listing for this exact card right now/.test(read("components/CatalogCardView.js")));
  // price alert offered only when the email system is enabled, and it genuinely matches by card slug
  assert.match(read("app/cards/[slug]/page.js"), /alertsEnabled=\{emailEnabled\(\)\}/);
  assert.match(read("app/api/check-alerts/route.js"), /const hub = await resolveCardSlug\(slug\);/);
});

test("category links: real price band / era pages only; no $100+ page implied", () => {
  assert.deepEqual(priceCategoryFor(3), { slug: "under-25", label: "Deals under $25" });
  assert.equal(priceCategoryFor(25).slug, "under-50");
  assert.equal(priceCategoryFor(99.99).slug, "under-100");
  assert.equal(priceCategoryFor(100), null);
  assert.equal(priceCategoryFor(null), null);
  assert.equal(eraCategoryFor("Base Set").slug, "vintage");
  assert.equal(eraCategoryFor("SV10: Destined Rivals").slug, "modern");
  assert.equal(eraCategoryFor("XY - Evolutions"), null);
});

// --------------------------------------------------------- social + sameAs

test("16. social links come only from the verified profile list (Instagram + X); no TikTok/YouTube URL", () => {
  assert.deepEqual(SOCIAL_PROFILES.map((p) => p.platform), ["instagram", "x"]);
  assert.deepEqual(SOCIAL_PROFILES.map((p) => p.url), ["https://www.instagram.com/pokemondealfinder/", "https://x.com/pkmdealfinder"]);
  const footer = read("components/SiteFooter.js");
  assert.match(footer, /SOCIAL_PROFILES\.map\(/);
  assert.match(footer, /rel="me noopener noreferrer"/);
  assert.match(footer, /aria-label=\{`Pokemon Deal Finder on \$\{s\.label\} \(opens in a new tab\)`\}/);
  for (const f of ["components/SiteFooter.js", "app/layout.js", "lib/socialProfiles.js"]) {
    const body = read(f).replace(/\/\/[^\n]*/g, "");
    assert.ok(!/tiktok\.com|youtube\.com|youtu\.be/i.test(body), `${f} carries an unverified TikTok/YouTube URL`);
  }
});

test("17. Organization.sameAs is exactly the visible footer profiles", () => {
  assert.deepEqual(organizationSameAs(), SOCIAL_PROFILES.map((p) => p.url));
  assert.match(read("app/layout.js"), /sameAs: organizationSameAs\(\),/);
});

test("18. social click tracking can never block navigation", () => {
  const boot = read("components/analytics/AnalyticsBootstrap.js");
  assert.ok(!/preventDefault\(/.test(boot), "the delegated click listener must stay passive");
  assert.match(boot, /props\.page_type === "auto"/);
  assert.match(boot, /catch \{\s*props = \{ \.\.\.props, page_type: "other" \};/);
  const footer = read("components/SiteFooter.js");
  assert.match(footer, /href=\{s\.url\}/, "a real href - navigation never depends on JS");
  assert.ok(!/onClick/.test(footer));
  assert.ok(ALLOWED_EVENTS.has(EVENTS.SOCIAL_FOLLOW_CLICKED) && EVENTS.SOCIAL_FOLLOW_CLICKED === "social_follow_clicked");
  assert.ok(ALLOWED_EVENTS.has(EVENTS.PRICE_CHECKER_ENTRY_CLICKED));
  assert.equal(pageTypeFromPath("/cards/charizard-base-set"), "card");
  assert.equal(pageTypeFromPath("/deals/12345"), "deal");
  assert.equal(pageTypeFromPath("/deals/under-25"), "category");
  assert.equal(pageTypeFromPath("/"), "home");
  assert.equal(pageTypeFromPath("/weird/path?x=1"), "other");
  for (const p of ["/", "/cards", "/pokemon/pikachu", "/sets/base-set", "/search", "/guides/x", "/about", "/zzz"]) assert.ok(PAGE_TYPES.includes(pageTypeFromPath(p)));
});

// ------------------------------------------------------- /search + home

test("8/9/10. /search keeps its canonical + noindex policy and renders the guide server-side", () => {
  const page = read("app/search/page.js");
  assert.match(page, /alternates: \{ canonical: "\/search" \}/);
  assert.match(page, /robots: query \? \{ index: false, follow: true \} : undefined/);
  assert.match(page, /guide=\{<PriceCheckerGuide \/>\}/);
  assert.ok(!/^\s*["']use client["']/m.test(read("components/PriceCheckerGuide.js")), "the guide must be a server component");
  assert.match(read("app/search/SearchClient.js"), /\{guide\}\s*<\/main>/);
  const guide = read("components/PriceCheckerGuide.js");
  assert.ok(!/href=\{?["'`]\/search\?/.test(guide), "the guide must not link to noindex /search?q= URLs");
  assert.ok(!/\$\d/.test(guide), "the guide states no prices of its own");
  // no competing tool URL: /price-checker stays a permanent redirect to /search
  assert.match(read("app/price-checker/page.js"), /permanentRedirect\("\/search"\)/);
});

test("11. homepage keeps deals PRIMARY and adds the price checker as the SECONDARY action", () => {
  const home = read("app/page.js");
  const primary = home.indexOf('data-analytics-click="discover_deals_clicked"');
  const secondary = home.indexOf('data-analytics-click="price_checker_entry_clicked"');
  assert.ok(primary > 0 && secondary > primary, "secondary action must follow the primary deal CTA");
  assert.match(home.slice(secondary - 200, secondary), /href="\/search"/);
  assert.match(home, /Check a card&apos;s price/);
});

// ----------------------------------------------------------- schema

test("25. no Product/Offer schema introduced in this phase", () => {
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|mjs|jsx)$/.test(f)) files.push(p);
    }
  };
  walk(join(REPO, "app"));
  walk(join(REPO, "components"));
  const withProduct = files
    .filter((f) => /"@type":\s*"(Product|Offer|AggregateOffer)"/.test(readFileSync(f, "utf8")))
    .map((f) => relative(REPO, f).replace(/\\/g, "/"))
    .sort();
  // the pre-17B set: live-listing hubs and listing detail pages, each built from real offers
  assert.deepEqual(withProduct, ["app/cards/[slug]/page.js", "app/deals/[id]/page.js", "app/sealed-deals/[id]/page.js"]);
  for (const f of ["components/CatalogCardView.js", "components/CardWorthAnswer.js", "components/CardNextSteps.js", "components/PriceCheckerGuide.js", "lib/cardWorth.js"]) {
    assert.ok(!/Product|Offer|FAQPage/.test(read(f).replace(/\/\/[^\n]*/g, "")), `${f} introduces Product/Offer/FAQ schema`);
  }
});
