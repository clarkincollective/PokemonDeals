// Phase UX-CVR-1 - SOCIAL LANDING + DEAL CONVERSION.
//
// Source-scanning guards for the conversion changes:
//   * auction vs BIN CTA labels stay correct and name eBay;
//   * the ended-deal branch has NO live purchase CTA but DOES expose real
//     alternative paths (card hub / species / set / related live deals /
//     footer nav + affiliate disclosure);
//   * trusted-image logic is untouched;
//   * the social landing badge is presentational only - it never reads or
//     alters price / reference / discount, and shows no raw UTM;
//   * the deal-detail primary CTA emits affiliate_click with a stable
//     origin_section + content_id;
//   * the related-live-deals helper is DB-only (no eBay call at render);
//   * there is one primary "go to eBay" CTA contract per surface.
// No network. No eBay.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const DEAL_PAGE = read("app/deals/[id]/page.js");
const SEALED_PAGE = read("app/sealed-deals/[id]/page.js");
const STICKY = read("components/StickyDealCta.js");
const DEALCARD = read("components/DealCard.js");
const SEALEDCARD = read("components/SealedDealCard.js");
const RELATED = read("components/RelatedDeals.js");
const BADGE = read("components/SocialLandingBadge.js");
const DEALS_LIB = read("lib/deals.js");

// split the deal page into the expired branch and the live remainder, the
// same way tests/scanner/deal-availability-freshness.test.mjs does.
function expiredBranch() {
  const first = DEAL_PAGE.indexOf("if (!shouldIndexDeal(deal) || !isDisplayableDeal(deal))");
  const start = DEAL_PAGE.indexOf("if (!shouldIndexDeal(deal) || !isDisplayableDeal(deal))", first + 1);
  const end = DEAL_PAGE.indexOf("// cardHub is only non-null when", start);
  assert.ok(end > start, "could not isolate the expired-deal branch");
  return DEAL_PAGE.slice(start, end);
}

// ---- CTA contract ------------------------------------------------

test("UX-CVR-1-1. the deal-detail primary CTA names eBay for BIN and auctions, and never implies a guaranteed buy", () => {
  // one contract: BIN -> "View on eBay", auction -> "Bid on eBay"
  assert.match(DEAL_PAGE, /isAuction \? "Bid on eBay →" : "View on eBay →"/);
  assert.match(SEALED_PAGE, /isAuction \? "Bid on eBay →" : "View on eBay →"/);
  // the old vague / urgency-tinged labels are gone from the detail pages
  assert.doesNotMatch(DEAL_PAGE, />\s*(View Deal|Bid Now)\s*→/);
  assert.doesNotMatch(SEALED_PAGE, />\s*(View Deal|Bid Now)\s*→/);
  // "Buy Now" is never used as the deal CTA
  assert.doesNotMatch(DEAL_PAGE, /Buy Now/i);
});

test("UX-CVR-1-2. the sticky CTA default + the deal-page sticky both name eBay and don't say 'Buy'", () => {
  assert.match(STICKY, /ctaLabel = "View on eBay →"/);
  assert.match(DEAL_PAGE, /ctaLabel=\{isAuction \? "Bid on eBay →" : "View on eBay →"\}/);
  assert.doesNotMatch(STICKY, /Buy Now|Buy It Now →/i);
});

test("UX-CVR-1-3. auction CTAs stay auction-worded (no settled-purchase framing)", () => {
  // the auction branch everywhere is "Bid on eBay", never "View on eBay"
  for (const [name, src] of [["deal page", DEAL_PAGE], ["sealed page", SEALED_PAGE], ["DealCard", DEALCARD], ["SealedDealCard", SEALEDCARD]]) {
    assert.match(src, /Bid on eBay →/, `${name} lost its auction CTA wording`);
  }
  // the sticky auction price is still labelled "current bid"
  assert.match(DEAL_PAGE, /priceLabel=\{isAuction \? "current bid" : undefined\}/);
});

// ---- ended / expired deal --------------------------------------

test("UX-CVR-1-4. the ended-deal branch renders NO live purchase CTA for the dead listing", () => {
  const b = expiredBranch();
  assert.doesNotMatch(b, /View Deal|Bid Now|View on eBay|Bid on eBay/i, "expired branch reused a live-deal CTA");
  assert.doesNotMatch(b, /href=\{deal\.affiliate_url\}/, "expired branch linked the dead listing");
  assert.doesNotMatch(b, /wrapEbayAffiliateUrl\(deal\.affiliate_url/, "expired branch wrapped the dead listing URL");
  assert.doesNotMatch(b, /redirect\(/i, "expired branch auto-redirects");
  assert.match(b, /ended|expired|not found/i);
});

test("UX-CVR-1-5. the ended-deal branch exposes real alternative paths", () => {
  const b = expiredBranch();
  // card hub, species, set, an eBay search, and back-to-all-deals
  assert.match(b, /\/cards\/\$\{cardHub\.slug\}/, "no card-hub link");
  assert.match(b, /\/pokemon\/\$\{speciesHub\.slug\}/, "no species link");
  assert.match(b, /\/sets\/\$\{setSlug\}/, "no set link");
  assert.match(b, /buildEbaySearchLink/, "no eBay search fallback");
  assert.match(b, /Back to all deals/);
  // related live deals module + a footer (which carries the affiliate disclosure)
  assert.match(b, /<RelatedDeals /, "no related-live-deals module on the expired page");
  assert.match(b, /<SiteFooter \/>/, "expired page has no footer (=> no affiliate disclosure)");
});

// ---- affiliate disclosure ------------------------------------

test("UX-CVR-1-6. the affiliate disclosure is present (footer) on both the live and expired deal page", () => {
  const footer = read("components/SiteFooter.js");
  assert.match(footer, /eBay and TCGPlayer affiliate.*commission/is);
  // live page renders <SiteFooter ...>, expired branch now does too
  assert.match(DEAL_PAGE, /<SiteFooter/);
  assert.equal((DEAL_PAGE.match(/<SiteFooter/g) || []).length >= 2, true, "expired branch must also render a footer");
});

// ---- trusted image logic untouched ---------------------------

test("UX-CVR-1-7. trusted-image selection is unchanged (still seller-front-first, subtle reference label)", () => {
  const li = read("lib/listingImage.js");
  assert.match(li, /SELLER_FRONT/);
  assert.match(li, /selectDealImageUrl/);
  const di = read("components/DealImage.js");
  assert.match(di, /Reference image/);
  // the deal page still uses the trusted contract, not deal.image_url raw
  assert.match(DEAL_PAGE, /dealImageProps\(deal\)/);
  assert.match(DEAL_PAGE, /trustedDealImageUrl\(deal\)/);
});

// ---- social landing context: presentational only -----------

test("UX-CVR-1-8. the social landing badge never reads or alters factual content and shows no raw UTM", () => {
  // no price / reference / discount / money logic in the badge
  assert.doesNotMatch(BADGE, /price|discount|market|savings|total_price|refInListingCurrency/i);
  // it reads utm_medium / utm_source only to decide whether to show, and
  // renders a FIXED string - the rendered JSX never mentions utm at all
  assert.match(BADGE, /utm_medium|utm_source/);
  const rendered = BADGE.slice(BADGE.indexOf("if (!fromSocial) return null;"));
  assert.doesNotMatch(rendered, /utm_/i, "badge renders a raw UTM value into the DOM");
  // the deal PAGE server render does not branch on utm_* (attribution is client-only)
  assert.doesNotMatch(DEAL_PAGE, /searchParams[\s\S]{0,80}utm_/i);
});

test("UX-CVR-1-9. social UTM does not change any price / reference / discount on the page", () => {
  // the money block is computed purely from the deal row, never from a
  // request param - the badge is appended, not woven into the price JSX
  assert.match(DEAL_PAGE, /const savedUsd = marketUsd - usdTotal/);
  assert.match(DEAL_PAGE, /<SocialLandingBadge \/>/);
  // the badge sits ABOVE the price card, as its own element
  const badgeAt = DEAL_PAGE.indexOf("<SocialLandingBadge />");
  const priceCardAt = DEAL_PAGE.indexOf("flex flex-col gap-6 rounded-xl border");
  assert.ok(badgeAt > 0 && priceCardAt > badgeAt, "badge should precede the price card, not be inside it");
});

// ---- analytics / funnel ------------------------------------

test("UX-CVR-1-10. the deal-detail primary CTA emits affiliate_click with a stable origin + content_id", () => {
  // AffiliateLink fires EVENTS.AFFILIATE_CLICK
  assert.match(read("components/AffiliateLink.js"), /capture\(EVENTS\.AFFILIATE_CLICK/);
  // the detail primary passes an explicit low-cardinality origin_section + content_id
  assert.match(DEAL_PAGE, /origin_section: "deal_detail_primary"/);
  assert.match(DEAL_PAGE, /content_id: String\(deal\.id\)/);
  // the related module attributes its clicks distinctly
  assert.match(RELATED, /section: "deal_related"/);
  assert.match(RELATED, /pageName="deal_related"/);
  assert.match(read("lib/affiliateSurfaces.js"), /deal_related: "deal_page"/);
});

test("UX-CVR-1-11. social content_id / utm_content is preserved through analytics (unchanged wiring)", () => {
  // the site still seeds landing utm_* into the analytics common context
  assert.match(read("components/analytics/AnalyticsBootstrap.js"), /utm_content/);
  assert.match(read("lib/analytics/session.js"), /utm_content/);
  // affiliate_click still forwards a content_id
  assert.match(read("components/AffiliateLink.js"), /content_id/);
});

// ---- no eBay call at render -------------------------------

test("UX-CVR-1-12. the related-live-deals helper is DB-only (no eBay call at render time)", () => {
  const at = DEALS_LIB.indexOf("async function fetchRelatedActiveDealsUncached");
  const end = DEALS_LIB.indexOf("export const fetchRelatedActiveDeals", at);
  assert.ok(at > 0 && end > at);
  const fn = DEALS_LIB.slice(at, end);
  assert.match(fn, /supabase\s*\n?\s*\.from\("deals"\)/);
  assert.doesNotMatch(fn, /from "@\/lib\/ebay"|getListingFreshness|browseSearch|fetch\(/);
  // RelatedDeals component imports nothing that talks to eBay
  assert.doesNotMatch(RELATED, /lib\/ebay|fetch\(|getListingFreshness/);
  // the deal page still never calls eBay verification synchronously
  assert.doesNotMatch(DEAL_PAGE, /getListingFreshness/);
});

// ---- mobile: one primary CTA semantic ---------------------

test("UX-CVR-1-13. mobile has ONE primary go-to-eBay CTA semantic (in-page hidden while sticky shows)", () => {
  // the reserved spacer + sticky are lg:hidden; the in-page CTA row is not
  // duplicated for mobile - the sticky is the mobile affordance and it
  // only appears after scrolling past the in-page button.
  assert.match(STICKY, /lg:hidden/);
  assert.match(STICKY, /scrollY > 480|scrollY >/);
  assert.match(DEAL_PAGE, /h-20 lg:hidden/); // spacer so the fixed bar never covers the footer
  // exactly one <StickyDealCta> instance on the deal page
  assert.equal((DEAL_PAGE.match(/<StickyDealCta/g) || []).length, 1);
});
