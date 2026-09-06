// P0 DEAL IMAGE INTEGRITY - card-back-only / unusable seller hero photo.
//
// FAILURE SHAPE (deal 32672, id NOT hard-coded): eBay returned exactly
// ONE image for the listing and it was a standard Pokemon card BACK (blue
// swirl / Poke Ball / "Pokemon" wordmark). It loads fine, so the deal
// hero showed a back with no card face. Fix: a deterministic detector
// (lib/listingImageClassify, sharp colour/structure features - NO vision,
// NO AI) records a per-deal verdict out of band; a shared PURE selection
// contract (lib/listingImage) turns that verdict into the image every
// surface renders, falling back to the trusted canonical exact-printing
// art, then a neutral no-image state.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  IMAGE_VERDICT,
  isCardBackFeatures,
  selectDealImageUrl,
  dealImageProps,
  trustedDealImageUrl,
} from "../../lib/listingImage.js";
import { classifyListingImage, cardBackFeatures } from "../../lib/listingImageClassify.js";
import { catalogImageUrl } from "../../lib/cardImage.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, "..", "..", p), "utf8");
const fixture = (name) => readFileSync(join(HERE, "..", "fixtures", "visual", name));

const TCG_ID = "284278"; // an exact printing id (the failure shape's card)
const CANON = catalogImageUrl(TCG_ID);
const SELLER = "https://i.ebayimg.com/images/g/abc/s-l1600.jpg";
const SELLER_ALT = "https://i.ebayimg.com/images/g/def/s-l1600.jpg";

// --- 1. the deterministic detector -----------------------------------

test("1a. isCardBackFeatures: all four structural conditions required", () => {
  const back = { ballRed: 34, ballBri: 37, borderBlue: 14, wmMirror: 2 };
  assert.equal(isCardBackFeatures(back), true);
  // drop any single condition -> not a back
  assert.equal(isCardBackFeatures({ ...back, ballRed: 5 }), false);
  assert.equal(isCardBackFeatures({ ...back, ballBri: 5 }), false);
  assert.equal(isCardBackFeatures({ ...back, borderBlue: -30 }), false);
  assert.equal(isCardBackFeatures({ ...back, wmMirror: -65 }), false);
  assert.equal(isCardBackFeatures(null), false);
});

test("1b. classifyListingImage: the card-back fixture -> CARD_BACK, card fronts -> SELLER_FRONT", async () => {
  assert.equal((await classifyListingImage(fixture("card-back-swirl.jpg"))).verdict, IMAGE_VERDICT.CARD_BACK);
  // a real card front (illustration, HP, attack text) is never a back
  assert.equal((await classifyListingImage(fixture("genuine-blastoise-front.jpg"))).verdict, IMAGE_VERDICT.SELLER_FRONT);
  assert.equal((await classifyListingImage(fixture("canonical-umbreon-fa.jpg"))).verdict, IMAGE_VERDICT.SELLER_FRONT);
  assert.equal((await classifyListingImage(fixture("genuine-tapulele-sleeved.jpg"))).verdict, IMAGE_VERDICT.SELLER_FRONT);
});

test("1c. an undecodable / tiny buffer classifies as a usable front, never a back", async () => {
  assert.equal((await classifyListingImage(Buffer.from("not an image"))).verdict, IMAGE_VERDICT.SELLER_FRONT);
  assert.equal(await cardBackFeatures(Buffer.from("xx")), null);
});

test("1d. detector is deterministic - same bytes, same verdict", async () => {
  const b = fixture("card-back-swirl.jpg");
  const a = await classifyListingImage(b);
  const c = await classifyListingImage(b);
  assert.deepEqual(a.features, c.features);
  assert.equal(a.verdict, c.verdict);
});

// --- 2. the PURE selection contract --------------------------------

test("2a. primary is a card back + an alternate seller face -> the alternate is selected", () => {
  const s = selectDealImageUrl({
    imageVerdict: IMAGE_VERDICT.SELLER_OTHER,
    imageUrl: SELLER,
    displayImageUrl: SELLER_ALT,
    cardTcgplayerId: TCG_ID,
  });
  assert.equal(s.url, SELLER_ALT);
  assert.equal(s.verdict, IMAGE_VERDICT.SELLER_OTHER);
});

test("2b. only seller image is a card back + exact canonical exists -> canonical fallback", () => {
  const s = selectDealImageUrl({ imageVerdict: IMAGE_VERDICT.CARD_BACK, imageUrl: SELLER, cardTcgplayerId: TCG_ID });
  assert.equal(s.url, CANON);
  assert.equal(s.verdict, IMAGE_VERDICT.CANONICAL_FALLBACK);
  assert.ok(s.url.includes(TCG_ID), "fallback is the EXACT printing id, not a generic image");
});

test("2c. only seller image is a card back + NO exact canonical -> neutral no-image (null), never the back", () => {
  const s = selectDealImageUrl({ imageVerdict: IMAGE_VERDICT.CARD_BACK, imageUrl: SELLER, cardTcgplayerId: null });
  assert.equal(s.url, null);
  assert.equal(s.verdict, IMAGE_VERDICT.NO_TRUSTED_IMAGE);
});

test("2d. a valid seller front is preferred over canonical", () => {
  assert.equal(
    selectDealImageUrl({ imageVerdict: IMAGE_VERDICT.SELLER_FRONT, imageUrl: SELLER, cardTcgplayerId: TCG_ID }).url,
    SELLER
  );
});

test("2e. an UNSCREENED row keeps its seller primary (no verdict -> not hidden)", () => {
  assert.equal(
    selectDealImageUrl({ imageVerdict: null, imageUrl: SELLER, cardTcgplayerId: TCG_ID }).url,
    SELLER
  );
});

test("2f. no generic same-species / different-printing substitution - the ONLY fallback URL is catalogImageUrl(exact id)", () => {
  const s = selectDealImageUrl({ imageVerdict: IMAGE_VERDICT.CARD_BACK, imageUrl: SELLER, cardTcgplayerId: TCG_ID });
  assert.equal(s.url, catalogImageUrl(TCG_ID));
  // a different id would be a different URL - proves it's keyed on the exact printing
  assert.notEqual(s.url, catalogImageUrl("999999"));
});

test("2g. deterministic - same inputs, same selection", () => {
  const args = { imageVerdict: IMAGE_VERDICT.CARD_BACK, imageUrl: SELLER, cardTcgplayerId: TCG_ID };
  assert.deepEqual(selectDealImageUrl(args), selectDealImageUrl(args));
});

// --- 3. render props + OG/JSON-LD contract -------------------------

test("3a. dealImageProps: a CARD_BACK row hands DealImage src=null + the exact tcg id (its canonical->badge chain renders)", () => {
  const p = dealImageProps({ image_verdict: IMAGE_VERDICT.CARD_BACK, image_url: SELLER, card_tcgplayer_id: TCG_ID });
  assert.equal(p.src, null);
  assert.equal(p.cardTcgplayerId, TCG_ID);
});

test("3b. dealImageProps: CARD_BACK + no canonical -> src=null AND cardTcgplayerId=null (neutral placeholder)", () => {
  const p = dealImageProps({ image_verdict: IMAGE_VERDICT.CARD_BACK, image_url: SELLER, card_tcgplayer_id: null });
  assert.deepEqual(p, { src: null, cardTcgplayerId: null });
});

test("3c. dealImageProps: a normal / unscreened row renders the seller photo unchanged", () => {
  assert.equal(dealImageProps({ image_url: SELLER, card_tcgplayer_id: TCG_ID }).src, SELLER);
  assert.equal(
    dealImageProps({ image_verdict: IMAGE_VERDICT.SELLER_OTHER, display_image_url: SELLER_ALT, image_url: SELLER, card_tcgplayer_id: TCG_ID }).src,
    SELLER_ALT
  );
});

test("3d. trustedDealImageUrl never yields a card-back seller photo", () => {
  assert.equal(trustedDealImageUrl({ image_verdict: IMAGE_VERDICT.CARD_BACK, image_url: SELLER, card_tcgplayer_id: TCG_ID }), CANON);
  assert.equal(trustedDealImageUrl({ image_verdict: IMAGE_VERDICT.CARD_BACK, image_url: SELLER, card_tcgplayer_id: null }), null);
  assert.equal(trustedDealImageUrl({ image_url: SELLER, card_tcgplayer_id: TCG_ID }), SELLER); // unscreened -> seller face
});

// --- 4. the surfaces use the shared contract --------------------

test("4a. DealCard + the deal detail page render through the shared dealImageProps selector", () => {
  for (const f of ["components/DealCard.js", "app/deals/[id]/page.js"]) {
    const src = read(f);
    assert.match(src, /dealImageProps/, `${f} must use dealImageProps`);
    assert.match(src, /from "@\/lib\/listingImage"/, `${f} must import the shared contract`);
    // no surface builds its own <DealImage src={deal.image_url}> anymore
    assert.doesNotMatch(src, /<DealImage\s+src=\{deal\.image_url\}/, `${f} still passes the raw seller url to DealImage`);
  }
});

test("4b. deal detail OG / Twitter / Product JSON-LD use trustedDealImageUrl, not deal.image_url", () => {
  const src = read("app/deals/[id]/page.js");
  assert.match(src, /const ogImage = trustedDealImageUrl\(deal\)/);
  assert.match(src, /image: trustedDealImageUrl\(deal\) \?\? undefined/); // productJsonLd
  assert.doesNotMatch(src, /images: deal\.image_url \? \[deal\.image_url\]/, "OG still advertises the raw seller image");
});

test("4c. the PERMANENT /cards/[slug] hero stays canonical-first; a seller photo is only a trusted-contract fallback", () => {
  const src = read("app/cards/[slug]/page.js");
  assert.match(src, /const heroImage = canonicalImage \?\? trustedDealImageUrl\(allOffers\[0\]\) \?\? null/);
  // the hero <Image> and both structured-data blocks use heroImage
  assert.match(src, /src=\{heroImage\}/);
  assert.doesNotMatch(src, /src=\{canonicalImage \?\? cheapest\.image_url\}/, "hero still falls back to a raw seller photo");
  // canonical must still win when it exists
  assert.match(src, /heroImage = canonicalImage \?\?/);
});

// --- 5. cost / safety guardrails -------------------------------

test("5a. no vision call, no AI image generation anywhere in the image path", () => {
  for (const f of [
    "lib/listingImage.js",
    "lib/listingImageClassify.js",
    "app/api/screen-deal-images/route.js",
    "components/DealImage.js",
  ]) {
    const src = read(f);
    assert.doesNotMatch(src, /VISION_API_KEY|visionClassify|anthropic\.com\/v1\/messages|images\/generations|dall-?e|stable-?diffusion|generateImage/i, `${f} reaches for vision / image generation`);
  }
});

test("5b. the render path does no per-request image processing - no sharp, no fetch in the pure contract", () => {
  const pure = read("lib/listingImage.js");
  assert.doesNotMatch(pure, /require\(["']sharp|from ["']sharp|fetch\(/, "lib/listingImage must stay pure (no sharp / no fetch)");
  // the surfaces import only the pure module, never the sharp classifier
  for (const f of ["components/DealCard.js", "app/deals/[id]/page.js", "app/cards/[slug]/page.js"]) {
    assert.doesNotMatch(read(f), /listingImageClassify/, `${f} must not import the sharp classifier`);
  }
});

test("5c. classification happens OUT OF BAND in a bounded worker, with NO eBay Browse calls", () => {
  const src = read("app/api/screen-deal-images/route.js");
  assert.match(src, /const BATCH = \d+/);
  assert.match(src, /CRON_SECRET/);
  assert.match(src, /image_checked_at/); // TTL-gated re-check queue
  assert.doesNotMatch(src, /EBAY_BROWSE_URL|searchListings|getListingSnapshot|buy\/browse/, "the image worker must not call the eBay Browse API");
});

test("5d. the existing visual-authenticity / counterfeit screening is untouched by this change", () => {
  const va = read("lib/visualAuthenticity.js");
  assert.match(va, /COUNTERFEIT_MISMATCH/);
  assert.doesNotMatch(va, /listingImage|image_verdict|CARD_BACK/, "the counterfeit screener must not be entangled with card-back logic");
  // DealImage keeps its own dead-URL -> canonical -> placeholder fallback
  const di = read("components/DealImage.js");
  assert.match(di, /onError/);
  assert.match(di, /catalogImageUrl/);
});

test("5e. eBay normalisation now captures ALL seller images (not just the primary)", () => {
  const src = read("lib/ebay.js");
  assert.match(src, /function allListingImages/);
  assert.match(src, /imageUrls: allListingImages\(item\)/);
  // and the scanner persists them best-effort, OUT of the core upsert
  const scan = read("app/api/refresh-deals/route.js");
  assert.match(scan, /persistImageUrls/);
  assert.match(scan, /const \{ image_urls, \.\.\.core \} = row_/);
});
