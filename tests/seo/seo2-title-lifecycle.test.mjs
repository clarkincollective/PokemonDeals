// SEO-2 - title correctness + deal lifecycle hygiene (live checks).
//   - /cards/[slug] title + H1 carry the collector number exactly once
//   - /deals/[id]: active 200 / expired -> 308 to the same card's
//     permanent page / no destination -> 404 / bogus -> 404 / category
//     dispatch untouched
//   - /pokemon/[slug]: lowercase canonical, case variants 308
//   - weak index titles / H1s replaced
//   - homepage pagination page>1 = noindex,follow
//   - species schema / OG parity between the two templates
// Guardrails: thresholds, display gate, affiliate rel, sitemap membership
// logic untouched.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { BASE, get, parseHtml, sitemapUrls, pathOf, normPath } from "./lib.mjs";
import { SPECIES_PILOT } from "../../lib/speciesCoverage.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORIGIN = "https://pokemondealfinder.com";

// A local `next start` emits the Location header twice on a dynamic-route
// redirect (fetch joins them with ", "); Vercel sends one. Use the first.
const firstLocation = (r) => String(r.location ?? "").split(",")[0].trim();

// Windows' case-insensitive filesystem makes the local ISR file cache
// collide "/pokemon/PIKACHU" with "/pokemon/pikachu" (whichever rendered
// first is served for both), so the case-variant checks are only
// meaningful against a Linux server (CI / preview / production). They
// are verified manually on a fresh local server with never-cached slugs.
const LOCAL_WINDOWS = process.platform === "win32" && /localhost|127\.0\.0\.1/.test(BASE);
const CASE_SKIP = LOCAL_WINDOWS && "case-variant URLs collide in the Windows local ISR file cache - run against a Linux server";

function ldTypes(parsed) {
  const out = [];
  for (const b of parsed.jsonLd) {
    assert.ok(b.ok, `invalid JSON-LD: ${b.error}`);
    const nodes = Array.isArray(b.data) ? b.data : [b.data];
    for (const n of nodes) out.push(n["@type"]);
  }
  return out;
}

function ogImage(html) {
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i);
  return m ? (m[0].match(/content=["']([^"']*)["']/i) ?? [])[1] ?? null : null;
}

// --- 1-3: card title / H1 identity -------------------------------------

// The exact production defects SEO-1 documented, plus a plain control.
const CARDS = [
  { p: "/cards/charizard-base-set", num: "004/102" },
  { p: "/cards/zapdos-h32-aquapolis", num: "H32/H32" },
  { p: "/cards/magneton-base-set-shadowless", num: "009/102" },
  { p: "/cards/professor-elm-s-lecture-188a-214-league-challenge-4th-place-league-championship-cards", num: "188a/214" },
  { p: "/cards/noivern-ex-220-091-sv-paldean-fates", num: "220/091" },
];
let cardPages = [];
before(async () => {
  cardPages = await Promise.all(CARDS.map(async (c) => ({ ...c, r: await get(c.p) })));
});

test("1. card <title> carries the collector number exactly once, in the '#<n>' position", () => {
  for (const { p, num, r } of cardPages) {
    if (r.status !== 200) continue;
    const core = (parseHtml(r.body).title ?? "").split(" | ")[0];
    assert.ok(core.includes(`#${num}`), `${p}: title lacks #${num}: ${core}`);
    assert.equal((core.match(/#/g) ?? []).length, 1, `${p}: more than one '#': ${core}`);
    // once the canonical "#<num>" is removed, the numerator must not
    // survive anywhere else as its own token (the old "Zapdos (H32)
    // #H32/H32" defect)
    const rest = core.replace(`#${num}`, "");
    const numerator = num.split("/")[0].replace(/^([A-Za-z]*)0+/, "$1");
    const re = new RegExp(`(^|[^A-Za-z0-9])0*${numerator.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![A-Za-z0-9])`, "gi");
    assert.equal((rest.match(re) ?? []).length, 0, `${p}: number still embedded elsewhere: ${core}`);
    assert.ok(!/\(\w[^)]*\([^)]*\)\)/.test(core), `${p}: nested parentheses: ${core}`);
    assert.ok(!/ \w{1,3}$/.test(core) || /Value$|\)$|\]$|\d$/.test(core), `${p}: looks mid-word clipped: ${core}`);
  }
});

test("2. card H1 carries the same identity - number exactly once, same as the title", () => {
  for (const { p, num, r } of cardPages) {
    if (r.status !== 200) continue;
    const parsed = parseHtml(r.body);
    const h1 = parsed.h1s[0] ?? "";
    assert.ok(h1.includes(`#${num}`), `${p}: H1 lacks #${num}: ${h1}`);
    assert.equal((h1.match(/#/g) ?? []).length, 1, `${p}: H1 '#' count: ${h1}`);
    assert.match(h1, /Price & Value$/, `${p}: H1 lost the intent tail: ${h1}`);
    // the H1 identity (before " — <set>") is exactly how the <title> starts
    const core = (parsed.title ?? "").split(" | ")[0];
    const h1Id = h1.split(" — ")[0];
    assert.ok(core.startsWith(h1Id), `${p}: title "${core}" does not start with the H1 identity "${h1Id}"`);
  }
});

test("3. the visible identity line still shows the number beneath the H1 (unchanged)", () => {
  for (const { p, r } of cardPages) {
    if (r.status !== 200) continue;
    const noSchema = r.body.replace(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi, " ");
    const at = noSchema.search(/<h1[\s>]/);
    const around = noSchema.slice(at, at + 900).replace(/<[^>]+>/g, " ");
    assert.match(around, /·\s*[A-Za-z]{0,5}\d{1,4}[a-z]?(?:\/\d{1,3})?\b/, `${p}: identity line missing`);
  }
});

// --- 4-9: deal lifecycle ------------------------------------------------

test("4. an active sitemap deal is a normal 200 (no redirect)", async () => {
  const { byType } = await sitemapUrls();
  const deals = byType.get("deals") ?? [];
  assert.ok(deals.length > 0, "no deals in the sitemap");
  let ok = 0;
  for (const u of deals.slice(0, 4)) {
    const r = await get(pathOf(u));
    if (r.status === 200 && !/noindex/.test(parseHtml(r.body).robots ?? "")) ok++;
  }
  // deals expire continuously; at least one of a fresh sample must be live
  assert.ok(ok >= 1, "no sampled sitemap deal rendered as a live 200");
});

test("5. an expired deal with a permanent card page 308s to that exact card, which is a 200", async () => {
  // real, long-expired listings (SEO-1: still drawing impressions): the
  // English card's permanent page exists, so the URL moves there for good.
  for (const [id, slug] of [
    ["21270", "arcanine-base-set-shadowless"],
    ["12603", "houndoom-h11-skyridge"],
  ]) {
    const r = await get(`/deals/${id}`);
    assert.equal(r.status, 308, `/deals/${id} -> HTTP ${r.status}`);
    assert.equal(pathOf(firstLocation(r)), `/cards/${slug}`, `/deals/${id} redirected to ${r.location}`);
    const target = await get(`/cards/${slug}`);
    assert.equal(target.status, 200, `/cards/${slug} -> HTTP ${target.status}`);
    assert.ok(!/noindex/.test(parseHtml(target.body).robots ?? ""), `/cards/${slug} is noindex`);
  }
});

test("6. an expired deal with no truthful card destination is 404 (not home / index / species / set)", async () => {
  // a Japanese print - the catalogue routes are English, so no permanent
  // card page exists to send anyone to
  const r = await get("/deals/35588");
  assert.equal(r.status, 404, `/deals/35588 -> HTTP ${r.status} ${r.location ?? ""}`);
});

test("7. a bogus deal id is 404", async () => {
  const r = await get("/deals/999999999");
  assert.equal(r.status, 404);
});

test("8. /deals/<category> dispatch inside [id] is untouched", async () => {
  for (const p of ["/deals/under-50", "/deals/graded", "/deals/vintage"]) {
    const r = await get(p);
    assert.equal(r.status, 200, `${p} -> HTTP ${r.status}`);
    assert.equal(normPath(parseHtml(r.body).canonicals[0]), p);
  }
  const jp = await get("/deals/japanese");
  assert.equal(jp.status, 308);
  assert.equal(pathOf(firstLocation(jp)), "/japanese-cards");
});

test("9. lifecycle logic lives in lib/dealPage.js and touches no deal-detection / display-gate code", () => {
  const src = readFileSync(join(REPO, "lib", "dealPage.js"), "utf8");
  for (const fn of ["isDisplayableDeal", "listingMatchesCard", "isVisualScreeningCandidate", "dealFreshness"]) {
    assert.ok(!src.includes(fn), `lib/dealPage.js references ${fn}`);
  }
  const page = readFileSync(join(REPO, "app", "deals", "[id]", "page.js"), "utf8");
  assert.match(page, /expiredDealDestination\(/);
  assert.match(page, /permanentRedirect\(destination\.href\)/);
  // the gate itself is still the same two checks
  assert.match(page, /!shouldIndexDeal\(deal\) \|\| !isDisplayableDeal\(deal\)/);
});

// --- 10-12: species canonical case ---------------------------------

test("10. /pokemon/pikachu is 200 with a lowercase self-canonical", async () => {
  const r = await get("/pokemon/pikachu");
  assert.equal(r.status, 200);
  assert.deepEqual(parseHtml(r.body).canonicals, [`${ORIGIN}/pokemon/pikachu`]);
});

// Species no other test fetches in lowercase (so even a case-insensitive
// local cache can't have primed them).
test("11. uppercase / mixed-case species slugs permanently redirect to the lowercase URL", { skip: CASE_SKIP }, async () => {
  for (const p of ["/pokemon/SMEARGLE", "/pokemon/DeLiBiRd", "/pokemon/Wobbuffet"]) {
    const r = await get(p);
    assert.equal(r.status, 308, `${p} -> HTTP ${r.status}`);
    assert.equal(pathOf(firstLocation(r)), p.toLowerCase(), `${p} -> ${r.location}`);
  }
});

test("12. bogus species (any case) stay 404; cards / sets case handling is unchanged (404)", { skip: CASE_SKIP }, async () => {
  assert.equal((await get("/pokemon/not-a-real-pokemon-xyz")).status, 404);
  const up = await get("/pokemon/NOT-A-REAL-POKEMON-XYZ");
  assert.ok(up.status === 308 || up.status === 404, `HTTP ${up.status}`);
  if (up.status === 308) assert.equal((await get(pathOf(firstLocation(up)))).status, 404);
  assert.equal((await get("/cards/Kakuna-Base-Set-Shadowless")).status, 404);
  assert.equal((await get("/sets/Team-Rocket")).status, 404);
});

// --- 13-15: species title / H1 / schema / OG parity ------------------

test("13. species title follows its cohort's formula; the H1 formula is shared by both", async () => {
  // SEO-2.3 (docs/seo-species-threshold-experiment.md) changed the TITLE for
  // the treated cohort only. The H1 was deliberately left alone, so it stays
  // the single stable formula on every species page, treated or not.
  const CONTROL_TITLE = (n) => `${n} Cards – Full List, Prices & Values`;
  const TREATED_TITLE = (n) => `${n} Cards: Prices, Values & Card List`;
  let treatedSeen = 0;
  let untreatedSeen = 0;
  for (const p of [
    "/pokemon/charizard", // treated
    "/pokemon/pikachu", // treated
    "/pokemon/eevee", // pre-registered control
    "/pokemon/luvdisc", // untreated remainder
    "/pokemon/dunsparce", // untreated remainder
  ]) {
    const r = await get(p);
    if (r.status !== 200) continue;
    const parsed = parseHtml(r.body);
    if (/noindex/.test(parsed.robots ?? "")) continue;
    const name = (parsed.title ?? "").split(" Cards")[0].trim();
    assert.ok(name, `${p}: could not read the species name from ${parsed.title}`);
    const treated = SPECIES_PILOT.includes(name);
    if (treated) treatedSeen++;
    else untreatedSeen++;
    assert.equal(
      parsed.title,
      `${(treated ? TREATED_TITLE : CONTROL_TITLE)(name)} | Pokemon Deal Finder`,
      `${p} (${treated ? "treated" : "untreated"}): ${parsed.title}`
    );
    // the H1 is the same formula for everyone and never advertises deals
    assert.equal(parsed.h1s[0] ?? "", CONTROL_TITLE(name), `${p}: H1 ${parsed.h1s[0]}`);
    assert.ok(!/for sale|deals?\b/i.test(parsed.h1s[0]), `${p}: H1 advertises sale/deals: ${parsed.h1s[0]}`);
  }
  // the sample must actually exercise both sides of the experiment
  assert.ok(treatedSeen > 0, "no treated species page was reachable");
  assert.ok(untreatedSeen > 0, "no untreated species page was reachable");
});

test("14. every indexable species page carries exactly one CollectionPage and no Product / Offer", async () => {
  for (const p of ["/pokemon/charizard", "/pokemon/pikachu", "/pokemon/luvdisc", "/pokemon/dunsparce", "/pokemon/tangela"]) {
    const r = await get(p);
    if (r.status !== 200) continue;
    const parsed = parseHtml(r.body);
    if (/noindex/.test(parsed.robots ?? "")) continue;
    const types = ldTypes(parsed);
    assert.equal(types.filter((t) => t === "CollectionPage").length, 1, `${p}: CollectionPage x${types.filter((t) => t === "CollectionPage").length}`);
    assert.equal(types.filter((t) => t === "BreadcrumbList").length, 1, `${p}: BreadcrumbList count`);
    for (const bad of ["Product", "Offer", "AggregateRating", "Review", "FAQPage"]) {
      assert.ok(!JSON.stringify(parsed.jsonLd).includes(`"@type":"${bad}"`), `${p} has ${bad}`);
    }
  }
});

test("15. every indexable species page has a real og:image (catalogue art or a real listing photo)", async () => {
  for (const p of ["/pokemon/charizard", "/pokemon/luvdisc", "/pokemon/dunsparce", "/pokemon/tangela"]) {
    const r = await get(p);
    if (r.status !== 200) continue;
    if (/noindex/.test(parseHtml(r.body).robots ?? "")) continue;
    const img = ogImage(r.body);
    assert.ok(img && /^https?:\/\//.test(img), `${p}: no og:image`);
  }
});

// --- 16: index page titles / H1s ---------------------------------------

test("16. weak index-page titles / H1s replaced with the SEO-2 wording", async () => {
  const expect = {
    // /guides now carries the market-data research alongside the guides, so
    // the SEO-2 wording was widened to describe the whole page rather than
    // only its guide half.
    "/guides": {
      title: "Pokemon Card Guides & Research: Prices, Condition & Market Data | Pokemon Deal Finder",
      h1: "Guides & Research",
    },
    "/best-finds": { title: "Best Pokemon Card Deals Today – Top 10 Below Market | Pokemon Deal Finder" },
    "/japanese-cards": { title: "Japanese Pokemon Card Deals – Below Market on eBay | Pokemon Deal Finder", h1: "Japanese Pokemon Card Deals" },
    "/sets": { title: "Browse Pokemon Cards by Set | Pokemon Deal Finder", h1: "Pokemon Card Sets: Checklists, Prices & Values" },
    "/pokemon": { title: "All Pokemon Cards by Pokemon – Prices & Values | Pokemon Deal Finder", h1: "All Pokemon Cards by Pokemon" },
  };
  for (const [p, e] of Object.entries(expect)) {
    const r = await get(p);
    assert.equal(r.status, 200, `${p} -> HTTP ${r.status}`);
    const parsed = parseHtml(r.body);
    assert.equal(parsed.title, e.title, `${p} title`);
    if (e.h1) assert.equal(parsed.h1s[0], e.h1, `${p} H1`);
    assert.ok(!/noindex/.test(parsed.robots ?? ""), `${p} noindex`);
  }
});

// --- 17: homepage pagination robots ------------------------------------

test("17. homepage page 1 is indexable; every query variant (?page=N, ?country=, filters) canonicalises to '/' and is noindex,follow at the server", async () => {
  // Homepage-caching r1: app/page.js reads no searchParams (so "/" stays
  // statically cacheable - RegionRedirect's client-side geo default writes
  // ?country= into the URL for almost every real visitor). Every query
  // variant renders the SAME static "/" HTML (self-canonical to "/",
  // never a distinct self-canonical per variant) and is kept out of the
  // index by next.config.mjs's X-Robots-Tag header - the same policy
  // /deals already uses for its own, much larger set of variants (see
  // tests/scanner/all-deals-r1.test.mjs's AD-19 and this file's own
  // HOME_VARIANT_PARAMS test below).
  const home = await get("/");
  assert.equal(home.status, 200);
  assert.ok(!/noindex/.test(parseHtml(home.body).robots ?? ""), "/ is noindex");
  assert.equal(normPath(parseHtml(home.body).canonicals[0]), "/");
  assert.equal(home.headers?.get?.("x-robots-tag"), null);
  for (const qs of ["?page=2", "?page=25", "?country=EBAY_GB", "?sort=newest", "?listing=FIXED_PRICE"]) {
    const r = await get(`/${qs}`);
    assert.equal(r.status, 200, `/${qs} -> HTTP ${r.status}`);
    const parsed = parseHtml(r.body);
    assert.ok(!/noindex/.test(parsed.robots ?? ""), `/${qs} gained a <meta robots> noindex (must be header-only)`);
    assert.equal(normPath(parsed.canonicals[0]), "/", `/${qs} canonical`);
    assert.ok(parsed.internalLinks.some((l) => l.startsWith("/deals/") || l.startsWith("/cards/")), `/${qs} has no deal/card links`);
  }
});

test("17b. next.config.mjs sends X-Robots-Tag noindex,follow for every homepage query variant, never for the clean '/'", async () => {
  const cfg = (await import(pathToFileURL(join(REPO, "next.config.mjs")).href)).default;
  const rules = await cfg.headers();
  const homeRules = rules.filter((r) => r.source === "/");
  const keys = homeRules.map((r) => {
    assert.deepEqual(r.headers, [{ key: "X-Robots-Tag", value: "noindex, follow" }]);
    assert.equal(r.has.length, 1);
    assert.equal(r.has[0].type, "query");
    assert.equal(r.has[0].value, undefined, "any non-empty value matches (an empty param renders the clean default page)");
    return r.has[0].key;
  });
  assert.deepEqual(keys.sort(), ["country", "listing", "maxPrice", "minPrice", "page", "sort", "type"]);
  assert.ok(homeRules.length > 0 && rules.some((r) => r.source === "/deals"), "the /deals rule set is untouched");
});

// --- 18: guardrails ------------------------------------------------------

test("18. thresholds, display gate, affiliate rel and sitemap membership logic are untouched", async () => {
  const idx = await import("../../lib/indexability.js");
  assert.equal(idx.CARD_HUB_MIN_LISTINGS, 2);
  assert.equal(idx.SET_MIN_LISTINGS, 3);
  assert.equal(idx.SPECIES_MIN_LISTINGS, 5);
  assert.equal((await import("../../lib/setHub.js")).SET_CATALOG_MIN_CARDS, 10);
  assert.equal((await import("../../lib/speciesHub.js")).SPECIES_CATALOG_MIN_CARDS, 6);
  const dq = await import("../../lib/dealQuality.js");
  assert.equal(typeof dq.isDisplayableDeal, "function");
  for (const f of ["components/AffiliateLink.js", "components/EbaySearchLink.js"]) {
    assert.match(readFileSync(join(REPO, f), "utf8"), /rel="sponsored/, `${f} lost rel="sponsored"`);
  }
  const sm = readFileSync(join(REPO, "lib", "sitemap.js"), "utf8");
  assert.match(sm, /isDisplayableDeal/);
  assert.match(sm, /MAX_DEAL_URLS = 5000/);
  assert.match(readFileSync(join(REPO, "components", "FilterBar.js"), "utf8"), /rel="nofollow"/);
});
