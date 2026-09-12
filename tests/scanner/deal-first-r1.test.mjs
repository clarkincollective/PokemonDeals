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
import { DEAL_STATE_FIXTURES } from "../../lib/dev/dealStateFixtures.js";
import { listingPresentation, conditionLabel } from "../../lib/dealQuality.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// ---- nav model ---------------------------------------------------------

test("R1-1. the header is three destinations: Deals, Cards & Sets, Guides & Research - every prior route kept in a submenu", () => {
  assert.deepEqual(NAV_GROUPS.map((g) => g.label), ["Deals", "Cards & Sets"]);
  assert.deepEqual(navInlineItems().map((l) => l.label), ["Guides & Research"]);
  const all = NAV_PRIMARY.map((l) => l.href);
  for (const href of ["/deals", "/best-finds", "/deals/auctions", "/deals/graded", "/deals/under-25", "/sealed-deals", "/japanese-cards", "/latest-releases", "/search", "/cards", "/sets", "/pokemon", "/market-data", "/guides"]) {
    assert.ok(all.includes(href), `nav still reaches ${href}`);
  }
  // the old Learn entries did not vanish: mobile menu + footer carry them
  assert.deepEqual(NAV_LEARN.map((l) => l.href), ["/how-it-works", "/methodology", "/#faq"]);
  // clean routes only - nothing that canonicalises away
  assert.ok(NAV_PRIMARY.every((l) => !l.href.includes("?")));
  // every declared event is allow-listed
  for (const l of NAV_PRIMARY) if (l.analyticsClick) assert.ok(ALLOWED_EVENTS.has(l.analyticsClick), l.analyticsClick);
  assert.equal(navGroupItems("deals").length + navGroupItems("catalogue").length + navInlineItems().length, NAV_PRIMARY.length);
});

test("R1-2. header, mobile menu and footer all render from the one model; dropdown links are in the HTML", () => {
  const header = read("components/SiteHeader.js");
  const menu = read("components/NavMenu.js");
  const footer = read("components/SiteFooter.js");
  const dropdown = read("components/NavDropdown.js");
  assert.match(header, /NAV_GROUPS\.map\(\(group\) => \(\s*<NavDropdown/);
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
  assert.match(src, /\{isAuction \? "View auction on eBay" : "View deal on eBay"\}/);
  assert.doesNotMatch(src, /Buy now|Buy it now →|Bid now|Purchase/i);
  assert.doesNotMatch(src, /line-through/);
  // the existing wrapper + surface attribution are untouched
  assert.match(src, /wrapEbayAffiliateUrl\(deal\.affiliate_url, \{ surface: surfaceForPageName\(pageName\) \}\)/);
  assert.match(src, /<AffiliateLink[\s\S]*href=\{affiliateHref\}/);
  // 44px primary action
  assert.match(src, /<AffiliateLink[\s\S]*className="flex min-h-11 w-full/);
});

test("R1-4. DealCard: one dominant price with a clear meaning, shipping stated from what the scan recorded", () => {
  const src = read("components/DealCard.js");
  assert.match(src, /Listing total/);
  assert.match(src, /hasShippingCharge \? \([\s\S]*?incl\.[\s\S]*?shipping[\s\S]*?\) : \(\s*"no shipping charge listed"/);
  assert.doesNotMatch(src, /Free shipping|free delivery|delivered total/i, "a 0 shipping figure is never called free on the card");
  // auctions still go through the shared AuctionPrice
  assert.match(src, /<AuctionPrice[\s\S]*marketUsd=\{showSavings \? marketUsd : null\}/);
});

test("R1-5. DealCard: the comparison carries its condition context and only renders on a trusted claim", () => {
  const src = read("components/DealCard.js");
  assert.match(src, /const showSavings = presentation\.savings === "trusted";/);
  assert.match(src, /Market reference\{" "\}[\s\S]{0,400}\{conditionText\}/, "reference line names the condition it is for");
  // the plain state renders the reasons and nothing green
  const plain = src.slice(src.indexOf("{!showSavings ? ("), src.indexOf(") : isAuction ? null : ("));
  assert.match(plain, /presentation\.notes\.map/);
  assert.doesNotMatch(plain, /emerald|below market|Save /);
  // the discount badge is gated the same way
  assert.match(src, /\{showSavings && \(\s*<span className=\{`absolute right-2 top-2/);
  assert.match(src, /data-offer-state=\{isAuction \? "auction" : showSavings \? "bin_compared" : "bin_plain"\}/);
});

test("R1-6. the fixtures reach each state through the REAL rules (no bypass)", () => {
  const by = Object.fromEntries(DEAL_STATE_FIXTURES.map((f) => [f.id, f]));
  assert.equal(listingPresentation(by.bin_compared.deal).savings, "trusted");
  assert.equal(listingPresentation(by.bin_plain.deal).savings, null);
  assert.match(listingPresentation(by.bin_plain.deal).notes.join(" "), /No verified market reference/);
  const up = listingPresentation(by.bin_upcoming.deal);
  assert.equal(up.savings, null);
  assert.equal(up.early, true);
  assert.match(up.notes.join(" "), /Upcoming — 30th Celebration releases/);
  assert.equal(by.auction.deal.listing_type, "AUCTION");
  assert.equal(conditionLabel(by.graded.deal), "PSA 9");
  assert.equal(conditionLabel(by.unverified_condition.deal), "Condition not verified");
  assert.equal(by.non_usd.deal.marketplace, "EBAY_GB");
  // nothing in a fixture claims availability or a real listing
  for (const f of DEAL_STATE_FIXTURES) {
    assert.match(f.deal.affiliate_url, /^https:\/\/www\.ebay\.com\/itm\/0000/);
    assert.equal(f.deal.image_url, null, "fixtures show labelled catalogue art, never a seller photo");
  }
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
