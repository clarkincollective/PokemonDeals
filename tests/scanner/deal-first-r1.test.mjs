// Deal-first premium overhaul - R1 component foundation.
//
// Source-level contracts for the shared header / footer / deal-card
// states. Rendering was verified in a browser (dev component sheet at
// 1280 and 390) and recorded in the phase ledger; a scan cannot establish
// pixels, so nothing here claims it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NAV_PRIMARY, NAV_GROUPS, NAV_LEARN, navGroupItems, navInlineItems } from "../../lib/navLinks.js";
import { ALLOWED_EVENTS } from "../../lib/analytics/events.js";
import { AFFILIATE_SURFACES, surfaceForPageName } from "../../lib/affiliateSurfaces.js";
import { DEAL_STATE_FIXTURES, FIXTURE_ART } from "../../lib/dev/dealStateFixtures.js";
import { listingPresentation, conditionLabel } from "../../lib/dealQuality.js";
import { offerShipping } from "../../lib/offerPresentation.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// ---- nav model ---------------------------------------------------------

test("R1-1. the header is three destinations: Deals, Cards & Sets, Guides & Research - every prior route kept in a submenu", () => {
  // STILL THREE DESTINATIONS. When /news was added the editorial slot
  // became a submenu ("News & Guides") rather than a fourth top-level
  // entry, so the deal-first cap this test exists to protect is intact:
  // header destinations = NAV_GROUPS + navInlineItems() = 3.
  assert.deepEqual(NAV_GROUPS.map((g) => g.label), ["Deals", "Cards & Sets", "News & Guides"]);
  assert.deepEqual(navInlineItems().map((l) => l.label), []);
  assert.equal(NAV_GROUPS.length + navInlineItems().length, 3, "the header must stay three destinations");
  const all = NAV_PRIMARY.map((l) => l.href);
  for (const href of ["/deals", "/best-finds", "/deals/auctions", "/deals/graded", "/deals/under-25", "/sealed-deals", "/japanese-cards", "/latest-releases", "/search", "/cards", "/sets", "/pokemon", "/market-data", "/guides", "/news"]) {
    assert.ok(all.includes(href), `nav still reaches ${href}`);
  }
  // the old Learn entries did not vanish: mobile menu + footer carry them
  assert.deepEqual(NAV_LEARN.map((l) => l.href), ["/how-it-works", "/methodology", "/#faq"]);
  // clean routes only - nothing that canonicalises away
  assert.ok(NAV_PRIMARY.every((l) => !l.href.includes("?")));
  // every declared event is allow-listed
  for (const l of NAV_PRIMARY) if (l.analyticsClick) assert.ok(ALLOWED_EVENTS.has(l.analyticsClick), l.analyticsClick);
  assert.equal(
    navGroupItems("deals").length + navGroupItems("catalogue").length + navGroupItems("editorial").length + navInlineItems().length,
    NAV_PRIMARY.length
  );
});

test("R1-2. header, mobile menu and footer all render from the one model; dropdown links are in the HTML", () => {
  const header = read("components/SiteHeader.js");
  const menu = read("components/NavMenu.js");
  const footer = read("components/SiteFooter.js");
  const dropdown = read("components/NavDropdown.js");
  assert.match(header, /NAV_RAIL\.map\(\(link\) =>/);
  assert.match(menu, /NAV_GROUPS\.map/);
  assert.match(footer, /NAV_PRIMARY\.filter\(\(l\) => l\.group === "deals"\)/);
  assert.match(footer, /NAV_PRIMARY\.filter\(\(l\) => l\.group === "catalogue"\)/);
  assert.match(footer, /NAV_LEARN\.map/);
  // crawlable: the dropdown panel is always rendered, hidden via `hidden`
  assert.match(dropdown, /hidden=\{!open\}/);
  assert.doesNotMatch(dropdown, /\{open && </);
  // footer stays a server component with the always-visible hub row
  assert.doesNotMatch(footer, /"use client"/);
  assert.match(footer, /aria-label="Browse the catalogue"/);
  // no Learn dropdown in the desktop header any more
  assert.doesNotMatch(header, /label="Learn"|NAV_LEARN/);
});

// ---- deal-card states --------------------------------------------------

test("R1-3. DealCard: the CTA names the destination and the state; no purchase certainty, no strikethrough", () => {
  const src = read("components/DealCard.js");
  // Consistency phase 1: a plain (no trusted comparison) listing gets the
  // neutral "View listing on eBay" wording - "deal" is reserved for a
  // trusted savings claim, auctions keep their own wording either way.
  assert.match(src, /\{isAuction \? "View auction on eBay" : showSavings \? "View deal on eBay" : "View listing on eBay"\}/);
  assert.doesNotMatch(src, /Buy now|Buy it now →|Bid now|Purchase/i);
  assert.doesNotMatch(src, /line-through/);
  // the existing wrapper + surface attribution are untouched
  assert.match(src, /wrapEbayAffiliateUrl\(deal\.affiliate_url, \{ surface: surfaceForPageName\(pageName\) \}\)/);
  assert.match(src, /<AffiliateLink[\s\S]*href=\{affiliateHref\}/);
  // 44px primary action
  // 2026-09-19: the primary control is the shared CTA_PRIMARY_CLASS (brand
  // red, 48px, 8px radius, hover/pressed/focus) so every surface agrees.
  assert.match(src, /export const CTA_PRIMARY_CLASS =\s*"flex min-h-12 w-full[^"]*rounded-lg bg-red-600[^"]*active:bg-red-800[^"]*focus-visible:outline-2/);
  assert.match(src, /<AffiliateLink[\s\S]*className=\{CTA_PRIMARY_CLASS\}/);
});

test("R1-4. DealCard: one dominant price with a clear meaning; shipping=0 is 'not confirmed', never free, and the saving is stated before shipping", () => {
  const src = read("components/DealCard.js");
  // headline label follows what the scan recorded, via the shared contract
  // (lib/offerPresentation - review fix P1: one rule for every renderer)
  assert.match(src, /const ship = offerShipping\(deal\);/);
  assert.match(src, /const shippingConfirmed = ship\.state === "confirmed";/);
  assert.match(src, /\{ship\.headline\}/);
  // the unconfirmed / unknown note is rendered from the contract's own
  // wording plus a "check on eBay" pointer (2026-09-19) - never "free"
  assert.match(src, /shippingConfirmed \? \([\s\S]*?incl\. shipping[\s\S]*?\) : \(\s*<>\{ship\.note\} — check on eBay<\/>/);
  assert.doesNotMatch(src, /Free shipping|free delivery|delivered total|no shipping charge listed/i, "a 0 shipping figure is never called free on the card");
  // the derived saving never reads as a verified delivered saving
  // graded-inventory-r1: the percentage comes from savingsPercentText ("N%" / "less than 1%")
  // 2026-09-22 rev 2: the saving is a flex row - a "You save" label, the
  // amount as the line's headline figure, the percentage (a solid chip
  // in the top two tiers), then the shipping qualifier. The QUALIFIER is
  // the thing this pins - a saving computed before shipping must SAY so -
  // and it survives the restyle in both branches of the line.
  assert.match(src, />You save<\/span>/, "the savings line still names what the figure is");
  assert.match(src, /<Price\s+usd=\{savedUsd\}/, "and still shows the saved amount");
  assert.equal(
    (src.match(/\{ship\.savingQualifier\.trim\(\)\}/g) ?? []).length,
    2,
    "both branches of the savings line state the qualifier"
  );
  assert.match(src, /data-shipping=\{ship\.state\}/);
  assert.equal(offerShipping({ shipping: 0 }).headline, "Listing price");
  assert.equal(offerShipping({ shipping: 0 }).note, "Shipping not confirmed");
  assert.equal(offerShipping({ shipping: 0 }).savingQualifier, " before shipping");
  assert.equal(offerShipping({ shipping: 3.5 }).headline, "Listing total");
  // auctions still go through the shared AuctionPrice, which says the same
  assert.match(src, /<AuctionPrice[\s\S]*marketUsd=\{showSavings \? marketUsd : null\}/);
  const ap = read("components/AuctionPrice.js");
  assert.match(ap, /"Shipping not confirmed"/);
  assert.doesNotMatch(ap, /"Free shipping"/);
});

test("R1-4b. DealCard shape: one vertical card at every width, artwork in a reserved box, full-width CTA", () => {
  const src = read("components/DealCard.js");
  // CONTRACT CHANGED 2026-09-22, deliberately. R1 made the phone card a
  // 7.25rem thumbnail beside a text column. The redesign brief requires
  // large vertical cards with prominent artwork on phones - a Pokemon
  // card is a visual collectible and a 116px stamp is the wrong primitive
  // for one. The card is now a single flex column at every width.
  //
  // What R1-4b actually guarded survives intact and is still asserted:
  // a RESERVED aspect box (no layout shift when the image lands),
  // object-contain (artwork is never cropped, because a cropped
  // collectible is a misrepresented one), and a CTA spanning the card.
  assert.match(src, /flex h-full flex-col overflow-hidden rounded-xl/, "one vertical card at every width");
  assert.doesNotMatch(src, /grid-cols-\[7\.25rem_1fr\]/, "the phone thumbnail layout is gone");
  assert.match(src, /aspect-\[6\/5\] w-full/, "reserved artwork box - fixed ratio, so no CLS");
  assert.match(src, /className="object-contain p-3 sm:p-4"/, "artwork never cropped");
  assert.match(src, /w-full items-center justify-center rounded-lg bg-red-600/, "CTA spans the card");
});

test("R1-5. DealCard: the comparison carries its condition context and only renders on a trusted claim", () => {
  const src = read("components/DealCard.js");
  assert.match(src, /const showSavings = presentation\.savings === "trusted";/);
  // 2026-09-22: the reference's condition moved into the tile's Price
  // details disclosure - still in the server HTML, still keyboard-
  // reachable, just no longer the third restatement of the same
  // comparison on the face of the card.
  assert.match(src, /<dt>Reference is for<\/dt>[\s\S]{0,200}\{conditionText\}/, "reference names the condition it is for");
  // the plain state renders the reasons and nothing green
  const plain = src.slice(src.indexOf("{!showSavings ? ("), src.indexOf(") : isAuction ? null : ("));
  assert.match(plain, /presentation\.notes\.map/);
  assert.doesNotMatch(plain, /emerald|below market|Save /);
  // the discount badge is gated the same way
  // round 2: the badge needs a trusted reference AND a known shipping breakdown
  // integrity-2026-09-19: AND the listing must be Buy It Now - an auction's
  // current bid never wears the green badge (amber "Bid −N%" instead)
  // UI audit 2026-09-20: the badge is components/SavingsBadge now - the gate is unchanged
  // 2026-09-22: an evidenced listing now shows the deal-quality score
  // in that corner and SavingsBadge is the fallback for a supported
  // saving we could not score. The gate this pins - the badge appears
  // only on a supported claim, and never on an auction, where a bid is
  // not a saving - is unchanged.
  assert.match(src, /!qualityScore && savingsSupported && !isAuction && \(\s*<SavingsBadge discountPct=\{deal\.discount_pct\}/);
  assert.match(src, /data-offer-state=\{isAuction \? "auction" : showSavings \? "bin_compared" : "bin_plain"\}/);
});

test("R1-6. the fixtures reach each state through the REAL rules (no bypass)", () => {
  const by = Object.fromEntries(DEAL_STATE_FIXTURES.map((f) => [f.id, f]));
  assert.equal(listingPresentation(by.bin_compared.deal).savings, "trusted");
  assert.equal(listingPresentation(by.bin_plain.deal).savings, null);
  assert.match(listingPresentation(by.bin_plain.deal).notes.join(" "), /No verified market reference/);
  // The upcoming fixture is judged at a fixed pre-release instant: the
  // expansion has since released (16 Sep 2026), so the system clock would
  // - correctly - render it "released ... this listing predates it".
  const up = listingPresentation(by.bin_upcoming.deal, Date.parse("2026-09-12T12:00:00Z"));
  assert.equal(up.savings, null);
  assert.equal(up.early, true);
  assert.match(up.notes.join(" "), /Upcoming — 30th Celebration releases/);
  assert.equal(by.auction.deal.listing_type, "AUCTION");
  assert.equal(conditionLabel(by.graded.deal), "PSA 9");
  assert.equal(conditionLabel(by.unverified_condition.deal), "Condition not verified");
  assert.equal(by.non_usd.deal.marketplace, "EBAY_GB");
  assert.equal(listingPresentation(by.bin_shipping_unconfirmed.deal).savings, "trusted");
  assert.equal(by.bin_shipping_unconfirmed.deal.shipping, 0);
  // nothing in a fixture claims availability or a real listing
  for (const f of DEAL_STATE_FIXTURES) {
    assert.match(f.deal.affiliate_url, /^https:\/\/www\.ebay\.com\/itm\/0000/);
    assert.equal(f.deal.image_url, null, "fixtures show labelled catalogue art, never a seller photo");
  }
  // artwork is CORRECTLY MATCHED: every id is a real catalogue product id
  // of the printing the identity line names (site checklists / guide
  // registry); the unreleased fixture and the round-2 long-set plain
  // fixture (no catalogue id known for its printing) are the only ones
  // without art, and both render the neutral no-image state
  const known = new Set(Object.values(FIXTURE_ART).concat(["45122"])); // 45122 = Snorlax 11/64 Jungle
  for (const f of DEAL_STATE_FIXTURES) {
    if (f.id === "bin_upcoming" || f.id === "bin_plain_long_set") assert.equal(f.deal.card_tcgplayer_id, null);
    else assert.ok(known.has(f.deal.card_tcgplayer_id), `${f.id}: artwork id ${f.deal.card_tcgplayer_id} is not in the matched registry`);
  }
  const page = read("app/dev/deal-states/page.js");
  assert.match(page, /Simulated offer · prices, dates and links are placeholders/);
});

test("R1-7. the reference-only state is a different object: dashed, labelled, search action, never a deal button or $0", () => {
  const src = read("components/ReferenceOfferCard.js");
  assert.match(src, /data-offer-state="reference_only"/);
  assert.match(src, /border-dashed/);
  assert.match(src, /Market reference · not a listing/);
  assert.match(src, /No reliable market reference right now\./);
  assert.match(src, /<EbaySearchLink[\s\S]*Find on eBay/);
  assert.doesNotMatch(src, /View deal on eBay|View on eBay|below market|Save /);
  assert.match(src, /not a guaranteed value/);
});

test("R1-8. the component sheet is dev-only: 404 in production, noindex, never linked, reads no data", () => {
  const page = read("app/dev/deal-states/page.js");
  assert.match(page, /if \(process\.env\.NODE_ENV === "production"\) notFound\(\);/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.doesNotMatch(page, /from "@\/lib\/deals"|supabase|fetch\(/);
  for (const f of ["components/SiteHeader.js", "components/SiteFooter.js", "components/NavMenu.js", "app/page.js", "lib/navLinks.js", "lib/sitemap.js"]) {
    assert.doesNotMatch(read(f), /\/dev\/deal-states/, `${f} links the dev sheet`);
  }
});

// ---- foundation ------------------------------------------------------

test("R1-9. tokens + reduced motion live in globals.css; the EPN surface enum is unchanged", () => {
  const css = read("app/globals.css");
  assert.match(css, /--radius-control: 0\.5rem;/);
  assert.match(css, /--color-accent: var\(--color-red-600\);/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  // the closed surface enum is exactly what docs/ebay-affiliate-attribution.md lists
  assert.deepEqual(
    [...AFFILIATE_SURFACES].sort(),
    ["auctions", "best_finds", "card", "deal_page", "deals", "home_all", "home_auction", "home_best", "home_just_added", "other", "pokemon", "recently_viewed", "search", "set"].sort()
  );
  assert.equal(surfaceForPageName("home_all_deals"), "home_all");
});
