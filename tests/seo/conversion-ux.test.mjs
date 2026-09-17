// SEO Phase 6A - customer psychology / conversion UX / trust hierarchy.
// Guards the honest-conversion rules: qualifying deals stay visually
// distinct from catalogue/reference states, an auction's current bid is
// never framed as a settled below-market purchase, no fake urgency /
// social proof, authentication language stays qualified, affiliate links
// stay sponsored, and catalogue-only entity pages never imply a deal.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get, parseHtml, sitemapUrls, sample, pathOf } from "./lib.mjs";
import { offerShipping } from "../../lib/offerPresentation.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ACCENTED = `Pok${String.fromCharCode(233)}mon`;

const read = (p) => readFileSync(join(REPO, p), "utf8");
function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// deal tiles that render the "below market / save" framing
const DEAL_TILES = [
  "components/DealCard.js",
  "components/SealedDealCard.js",
  "components/SpeciesCard.js",
  "components/CatalogueBrowser.js",
];

let home, homeText, catSpeciesPath, catSpeciesText, catSetPath, catSetText;

before(async () => {
  home = await get("/");
  homeText = text(home.body);

  const sm = await sitemapUrls();
  // a catalogue-only species: /pokemon/[slug] that renders the "no
  // qualifying below-market deal" copy
  for (const p of sample((sm.byType.get("pokemon") ?? []).map(pathOf), 12)) {
    const r = await get(p);
    if (r.status === 200 && /no qualifying below-market|No active below-market/i.test(text(r.body))) {
      catSpeciesPath = p;
      catSpeciesText = text(r.body);
      break;
    }
  }
  for (const p of sample((sm.byType.get("sets") ?? []).map(pathOf), 12)) {
    const r = await get(p);
    if (r.status === 200 && /no qualifying below-market [A-Za-z].{0,40} deal to feature right now/i.test(text(r.body))) {
      catSetPath = p;
      catSetText = text(r.body);
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// 1-3: qualifying deal vs catalogue/reference distinction
// ---------------------------------------------------------------------------

test("1. a qualifying deal is visually distinct from a catalogue card (emerald deal treatment, neutral catalogue)", () => {
  const sc = read("components/SpeciesCard.js");
  // deal tile: emerald border + emerald "View/Bid on eBay" CTA
  assert.match(sc, /border-emerald-500/);
  assert.match(sc, /bg-emerald-600[\s\S]{0,300}(View on eBay|View Deal on eBay|Bid on eBay)/);
  // catalogue tile: neutral "Reference price · PokemonPriceTracker" + outlined "Find on eBay"
  assert.match(sc, /Reference price/);
  assert.match(sc, /PokemonPriceTracker/);
  assert.match(sc, /border border-zinc-300[\s\S]{0,320}Find on eBay/);
});

test("2. no 'save' / below-market styling on an ordinary catalogue card", () => {
  const sc = read("components/SpeciesCard.js");
  // isolate the NO-DEAL branch: it is the only place "Reference price"
  // appears; take a generous window around it.
  const at = sc.indexOf("Reference price");
  assert.ok(at > 0, "SpeciesCard has no 'Reference price' catalogue label");
  const nonDeal = sc.slice(at - 400, at + 800);
  assert.ok(!/below market/i.test(nonDeal), "catalogue branch of SpeciesCard shows 'below market'");
  assert.ok(!/\bsave\b|current bid/i.test(nonDeal), "catalogue branch of SpeciesCard shows a savings / bid claim");
  // SearchClient's below-market badge. This used to match the literal
  // `{c.deal && ...}`; the badge is now behind a NAMED gate, so assert what
  // the gate MEANS. `c.deal &&` was mere truthiness - a deal row with no
  // trusted comparison would still have shown the badge. The current gate
  // additionally requires a discount to exist and the shipping breakdown to
  // support a claim, so this is a strictly stronger rule, not a relaxed one.
  const search = read("app/search/SearchClient.js");
  const gate = (search.match(/const showSavings = ([^;]+);/) ?? [])[1];
  assert.ok(gate, "SearchClient no longer defines the showSavings gate the badge hangs on");
  assert.match(gate, /c\.deal\?\.discountPct != null/, `badge gate no longer requires a deal with a discount: ${gate}`);
  assert.match(gate, /savingClaim !== "none"/, `badge gate no longer requires a claimable saving: ${gate}`);
  // ...and the badge is genuinely inside that gate, not merely near it
  const badgeAt = search.indexOf("% below market");
  assert.ok(badgeAt > 0, "SearchClient no longer renders a below-market badge at all");
  assert.match(
    search.slice(Math.max(0, badgeAt - 300), badgeAt),
    /\{showSavings &&/,
    "the below-market badge is no longer rendered inside the showSavings gate"
  );

  // The rendered proof: a catalogue-only page has no qualifying deal by
  // definition, so no savings framing may reach the visitor on one.
  for (const [label, body] of [["species", catSpeciesText], ["set", catSetText]]) {
    if (!body) continue;
    assert.ok(!/\d+% below market/i.test(body), `${label} catalogue-only page renders a below-market percentage`);
    assert.ok(!/\bYou save\b/i.test(body), `${label} catalogue-only page renders a "You save" claim`);
  }
});

test("3. deal CTAs name eBay / the destination (no vague 'view' / 'go' / 'click here')", () => {
  for (const f of ["components/DealCard.js", "components/SpeciesCard.js", "components/SealedDealCard.js"]) {
    const src = read(f);
    assert.match(src, /(View on eBay|View deal on eBay|View auction on eBay|Check deal on eBay|View Deal on eBay|Bid on eBay|Bid Now|Check on eBay)/, `${f} has no eBay-named deal CTA`);
    assert.ok(!/>\s*(Click here|Go|View)\s*<\//i.test(src), `${f} has a vague CTA`);
  }
});

// ---------------------------------------------------------------------------
// 4-6: no fake urgency / social proof; auction honesty
// ---------------------------------------------------------------------------

test("4. no fabricated urgency language anywhere in the app", () => {
  const BAD = /(selling fast|almost gone|going fast|won'?t last|hurry|act now|last chance|only \d+ left|limited stock|while stocks last|don'?t miss out)/i;
  for (const f of [...DEAL_TILES, "app/page.js", "app/best-finds/page.js", "app/deals/[id]/page.js", "app/sealed-deals/[id]/page.js", "components/DealCategoryPage.js"]) {
    assert.ok(!BAD.test(read(f)), `${f} contains fabricated-urgency language`);
  }
  assert.ok(!BAD.test(homeText), "homepage renders fabricated-urgency language");
});

test("5. no fabricated social-proof language (fake viewers / buyers / 'trending')", () => {
  const BAD = /(\d[\d,]* (people|collectors|buyers|viewers) (are )?(viewing|watching|bought|looking)|trending with collectors|everyone'?s buying|popular with collectors|\d+ sold in the last)/i;
  for (const f of [...DEAL_TILES, "app/page.js", "app/best-finds/page.js"]) {
    assert.ok(!BAD.test(read(f)), `${f} contains fabricated social proof`);
  }
  assert.ok(!BAD.test(homeText), "homepage renders fabricated social proof");
});

test("6. an auction's current bid is never framed as a settled / guaranteed below-market price", () => {
  // P0 auction-price-integrity: the primary surfaces render auctions
  // through the shared <AuctionPrice>, which headlines the CURRENT BID and
  // shows shipping + estimated landed total as their own lines - the
  // landed total is never shown as though it were the bid.
  for (const f of [
    "components/DealCard.js",
    "components/SealedDealCard.js",
    "app/deals/[id]/page.js",
    "app/sealed-deals/[id]/page.js",
  ]) {
    assert.match(read(f), /<AuctionPrice/, `${f}: auctions must render through AuctionPrice`);
  }
  const ap = read("components/AuctionPrice.js");
  assert.match(ap, /Current bid/, "AuctionPrice: the headline figure is labelled the current bid");
  assert.match(ap, /bids can raise the final price|can rise/i, "AuctionPrice: keeps the price-can-rise caveat");
  assert.ok(!/You save|Save <Price/.test(ap), "AuctionPrice must not tell the visitor they 'save $' on an auction");
  // Projected-shape tiles (no stored bid available) show the landed figure
  // as an ESTIMATE - never labelled "current bid" - and still flag rises.
  //
  // SpeciesCard no longer hard-codes that label: it renders
  // shipping.auctionTotalLabel, so the guarantee now lives in
  // lib/offerPresentation. Check the helper's ACTUAL output for every
  // shipping state against literal expected strings (not against the helper
  // itself), then check each tile really uses it.
  const AUCTION_LABELS = [
    [{ shipping: 4.5 }, "confirmed", "Est. total"],
    [{ shipping: 0 }, "unconfirmed", "Est. total before shipping"],
    [{ shipping: null }, "unknown", "Recorded total"],
  ];
  for (const [row, expectedState, expectedLabel] of AUCTION_LABELS) {
    const s = offerShipping(row);
    assert.equal(s.state, expectedState, `offerShipping(${JSON.stringify(row)}) state`);
    assert.equal(s.auctionTotalLabel, expectedLabel, `offerShipping(${JSON.stringify(row)}) auction label`);
    // the point of the rule: in NO state is the landed figure called a bid,
    // and in no state is it presented as a settled price
    assert.ok(!/current bid/i.test(s.auctionTotalLabel), `auction label reads as a bid: ${s.auctionTotalLabel}`);
    assert.match(s.auctionTotalLabel, /^(Est\. total|Recorded total)/, `auction label is not marked as an estimate: ${s.auctionTotalLabel}`);
  }
  // the "unknown" state may claim no saving at all - so a landed figure we
  // cannot break down can never carry a below-market percentage
  assert.equal(offerShipping({ shipping: null }).savingClaim, "none");

  const speciesSrc = read("components/SpeciesCard.js");
  assert.match(speciesSrc, /isAuction \? shipping\.auctionTotalLabel/, "SpeciesCard no longer labels the auction figure from offerShipping");
  assert.match(speciesSrc, /Auction, bids can rise/, "SpeciesCard auction tile lost the 'bids can rise' caveat");
  // CatalogueBrowser still labels its auction tile inline; that literal is
  // the behaviour, so assert it directly.
  const browserSrc = read("components/CatalogueBrowser.js");
  assert.match(browserSrc, /isAuction && \([\s\S]{0,300}Est\. total/, "CatalogueBrowser auction tile no longer labels the figure 'Est. total'");
  assert.match(browserSrc, /auction, bids can rise/i, "CatalogueBrowser auction tile lost the 'bids can rise' caveat");
  for (const [f, src] of [["components/SpeciesCard.js", speciesSrc], ["components/CatalogueBrowser.js", browserSrc]]) {
    assert.ok(!/isAuction \?[\s\S]{0,300}(You save|Save <Price)/.test(src), `${f}: auction branch still says "save $"`);
    assert.ok(!/isAuction[\s\S]{0,300}Current bid/.test(src), `${f}: landed total still mislabelled "Current bid"`);
  }
  // and never the words "guaranteed final price"
  for (const f of ["app/deals/[id]/page.js", "app/sealed-deals/[id]/page.js", "components/DealCard.js", "components/AuctionPrice.js"]) {
    assert.ok(!/guaranteed final price|final price guaranteed/i.test(read(f)), `${f} calls the auction price guaranteed`);
  }
});

// ---------------------------------------------------------------------------
// 7-8: authentication + market-reference language
// ---------------------------------------------------------------------------

test("7. authentication language stays qualified (no 'every listing authenticated / we guarantee authenticity')", () => {
  const BAD = /(every listing (is )?authenticated|we (verify|guarantee) (the )?authenticity|all cards? (are )?verified authentic|we authenticate every|guaranteed authentic)/i;
  for (const f of ["app/methodology/page.js", "app/how-it-works/page.js", "components/ListingChecks.js", "lib/trustContent.js", "app/page.js"]) {
    assert.ok(!BAD.test(read(f)), `${f} overclaims authentication`);
  }
  assert.ok(!BAD.test(homeText), "homepage overclaims authentication");
});

test("8. the market reference is labelled as a reference / recent-sold guide, not a guaranteed value", () => {
  for (const f of ["components/DealCard.js", "components/SealedDealCard.js", "components/SpeciesCard.js", "components/CatalogueBrowser.js"]) {
    const src = read(f);
    assert.ok(/market ref|Market ref|Market reference|below market|under market ref|Reference price|market_price|refPrice/i.test(src), `${f} shows a price with no reference labelling`);
  }
  // the standard disclaimer is present on the value surfaces
  for (const f of ["app/cards/[slug]/page.js", "components/CatalogCardView.js", "app/search/SearchClient.js"]) {
    assert.match(read(f), /not a guaranteed sale value|not a guaranteed value/i, `${f} missing the market-reference disclaimer`);
  }
});

// ---------------------------------------------------------------------------
// 9-10: catalogue-only entity pages never imply a deal
// ---------------------------------------------------------------------------

test("9. a catalogue-only Pokemon page does not claim an active deal", () => {
  if (!catSpeciesText) return;
  assert.match(catSpeciesText, /no (qualifying below-market|active below-market)/i);
  assert.ok(!/Best .+ deals[\s\S]{0,80}Live eBay listings below their real market value/i.test(catSpeciesText),
    `${catSpeciesPath} renders a populated "Best deals" section on a no-deal page`);
});

test("10. a catalogue-only set page does not claim an active deal", () => {
  if (!catSetText) return;
  assert.ok(
    /no qualifying below-market/i.test(catSetText),
    `${catSetPath} is not clearly a catalogue-only set`
  );
  assert.ok(!/deal to feature right now[\s\S]{0,40}Save \$/i.test(catSetText), "catalogue-only set shows a 'Save $' claim");
});

// ---------------------------------------------------------------------------
// 11-14: funnel integrity
// ---------------------------------------------------------------------------

test("11. search results route into permanent /cards/[slug] pages", () => {
  const src = read("app/search/SearchClient.js");
  assert.match(src, /href=\{c\.cardHref\}/);
  assert.match(src, /See (price & this deal|full price & value)/);
  // no parallel price modal
  assert.ok(!/showModal|<dialog|PriceModal/i.test(src), "SearchClient reintroduced a price modal");
});

test("12. the exact-card page keeps the market reference above the deal/listings context", async () => {
  // This used to look for "<CardPriceSummary" in the page source. That
  // component is now rendered further down, INSIDE <CardMarketPanel> (the
  // condition/graded ladder), while the headline reference moved to
  // <CardMarketSummary> / <CardPriceIntelligence>. Naming components made
  // the assertion track the component tree rather than the thing it
  // protects, so check the ORDER A VISITOR ACTUALLY SEES in the rendered
  // page: the market reference is established before the listings context.
  // Reaching a card page that HAS a listings area matters: a card with no
  // hub/offers renders <CatalogCardView> instead, which has no listings
  // section to order anything against. Sampling /cards/* at random mostly
  // lands on those. A deal page, by definition, has a live listing - so
  // follow its card link and we are guaranteed the template under test.
  const sm = await sitemapUrls();
  const dealPages = (sm.byType.get("deals") ?? []).map(pathOf).filter((p) => /^\/deals\/\d+$/.test(p));
  assert.ok(dealPages.length > 0, "no deal pages in the sitemap to reach a card page from");
  let checked = 0;
  for (const dp of sample(dealPages, 10)) {
    const dr = await get(dp);
    if (dr.status !== 200) continue;
    const cardHref = (dr.body.match(/href="(\/cards\/[a-z0-9-]+)"/) ?? [])[1];
    if (!cardHref) continue;
    const r = await get(cardHref);
    if (r.status !== 200) continue;
    const html = r.body;
    // the listings AREA wrapper (id="card-offers") is rendered unconditionally
    // around <CardDealFilters>; the inner id="listings" anchor only appears
    // once there are offers, so it is the wrong thing to order against.
    const iListings = html.indexOf('id="card-offers"');
    if (iListings < 0) continue;
    const iRef = html.search(/market reference/i);
    assert.ok(iRef >= 0, `${cardHref}: no market reference on the page at all`);
    assert.ok(iRef < iListings, `${cardHref}: the listings area (${iListings}) precedes the market reference (${iRef})`);
    checked++;
    if (checked >= 3) break;
  }
  assert.ok(checked > 0, "no card page with a listings area was reachable to check ordering");

  // and the source still puts the reference components before the filters,
  // so a reorder is caught even when no live listing exists to render
  const src = read("app/cards/[slug]/page.js");
  const iSummary = src.indexOf("<CardMarketSummary");
  const iIntel = src.indexOf("<CardPriceIntelligence");
  const iFilters = src.indexOf("<CardDealFilters");
  assert.ok(iSummary > 0, "the card page no longer renders <CardMarketSummary>");
  assert.ok(iFilters > 0, "the card page no longer renders the <CardDealFilters> listings area");
  assert.ok(iSummary < iFilters, "<CardMarketSummary> must render before the listings area");
  assert.ok(iIntel > 0 && iIntel < iFilters, "<CardPriceIntelligence> must render before the listings area");
});

test("13. affiliate links keep rel=\"sponsored\"", () => {
  for (const f of ["components/AffiliateLink.js", "components/EbaySearchLink.js"]) {
    assert.match(read(f), /rel="sponsored/, `${f} lost rel="sponsored"`);
  }
});

test("14. the direct exact-listing eBay destination is preserved (affiliate_url / exact /itm/ URL gate)", () => {
  // Phase: eBay affiliate sub-ID attribution - deal.affiliate_url is
  // re-wrapped (wrapEbayAffiliateUrl only ever sets query params; it
  // never touches host/pathname) before reaching the CTA.
  const dealCardSrc = read("components/DealCard.js");
  assert.match(dealCardSrc, /wrapEbayAffiliateUrl\(deal\.affiliate_url,/);
  assert.match(dealCardSrc, /href=\{affiliateHref\}/);
  // SpeciesCard only treats a card as a deal tile when it carries an
  // exact /itm/ listing URL - that gate must still be there
  assert.match(read("components/SpeciesCard.js"), /itm\\\/\\d\+/);
});

// ---------------------------------------------------------------------------
// 15-18: analytics / mobile / spelling / guardrails
// ---------------------------------------------------------------------------

test("15. analytics carry no raw search text / PII", () => {
  const hs = read("components/HeroSearch.js");
  const sc = read("app/search/SearchClient.js");
  // both search events send a LENGTH, never the query string itself
  assert.match(hs, /track\("Hero Search Submit", \{ queryLength: v\.length \}\)/);
  assert.match(sc, /track\("Price Checker Search", \{ queryLength: q\.length/);
  // no track() call anywhere passes a raw `query:` / `q:` / `searchText:` field
  for (const [f, src] of [["HeroSearch", hs], ["SearchClient", sc]]) {
    for (const m of src.matchAll(/track\(\s*"[^"]+"\s*,\s*\{([^}]*)\}/g)) {
      assert.ok(!/\b(query|searchText|term|q)\s*:/.test(m[1]), `${f} track() payload carries raw search text: ${m[1].trim()}`);
    }
  }
});

test("16. homepage does not horizontally overflow (no fixed widths wider than the viewport in the hero)", async () => {
  // structural proxy: the page uses responsive max-w-* containers and the
  // body isn't given a min-width; a full render check is a manual step.
  assert.equal(home.status, 200);
  assert.ok(!/style="[^"]*width:\s*\d{4,}px/i.test(home.body), "homepage has an inline multi-thousand-px width");
  assert.ok(!/min-w-\[\d{4,}px\]/.test(home.body), "homepage forces a >=1000px min-width");
});

test("17. homepage names the independent, non-seller relationship near the top", () => {
  assert.match(homeText, /independent price comparison, not a shop|you buy from the eBay seller/i);
  assert.ok(!homeText.includes(ACCENTED), "homepage renders an accented \"Pokemon\"");
});

test("18. deal-detection / authenticity / indexability logic is untouched by Phase 6A", () => {
  for (const f of [...DEAL_TILES, "app/page.js", "components/HeroSearch.js", "app/deals/[id]/page.js"]) {
    const src = read(f);
    for (const fn of ["BEST_FINDS_MAX_DISCOUNT_PCT", "SPECIES_MIN_LISTINGS", "SET_MIN_LISTINGS", "CARD_HUB_MIN_LISTINGS", "isVisualScreeningCandidate"]) {
      assert.ok(!src.includes(`${fn} =`), `${f} redefines ${fn}`);
    }
  }
  assert.match(read("lib/dealMatching.js"), /function listingMatchesCard\(/);
  assert.match(read("lib/dealQuality.js"), /isDisplayableDeal/);
});
