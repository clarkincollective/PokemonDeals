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
  assert.match(sc, /bg-emerald-600[\s\S]{0,300}(View Deal on eBay|Bid on eBay)/);
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
  // SearchClient: the below-market badge only renders when c.deal is truthy
  assert.match(read("app/search/SearchClient.js"), /\{c\.deal &&[\s\S]{0,260}below market/);
});

test("3. deal CTAs name eBay / the destination (no vague 'view' / 'go' / 'click here')", () => {
  for (const f of ["components/DealCard.js", "components/SpeciesCard.js", "components/SealedDealCard.js"]) {
    const src = read(f);
    assert.match(src, /(Check deal on eBay|View Deal on eBay|Bid on eBay|Bid Now|Check on eBay)/, `${f} has no eBay-named deal CTA`);
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
  for (const f of ["components/SpeciesCard.js", "components/CatalogueBrowser.js"]) {
    const src = read(f);
    if (!/isAuction/.test(src)) continue;
    assert.match(src, /isAuction[\s\S]{0,400}Est\. total/, `${f}: auction landed figure isn't labelled 'est. total'`);
    assert.match(src, /isAuction[\s\S]{0,400}(bids can rise|can rise)/i, `${f}: auction copy doesn't say the price can rise`);
    assert.ok(!/isAuction \?[\s\S]{0,300}(You save|Save <Price)/.test(src), `${f}: auction branch still says "save $"`);
    assert.ok(!/isAuction \?[\s\S]{0,300}Current bid/.test(src), `${f}: landed total still mislabelled "Current bid"`);
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

test("12. the exact-card page keeps the market reference above the deal/listings context", () => {
  const src = read("app/cards/[slug]/page.js");
  const iSummary = src.indexOf("<CardPriceSummary");
  // 13B.4.2: the live-listings area (with the id="listings" anchor + the
  // structured deal filters) is now the <CardDealFilters> client
  // component; the market-reference summary must still render before it.
  const iListings = src.indexOf("<CardDealFilters");
  assert.ok(iSummary > 0 && iListings > 0 && iSummary < iListings, "CardPriceSummary must render before the listings area");
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
