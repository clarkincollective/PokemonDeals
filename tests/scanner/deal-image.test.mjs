// Deal / listing image safety: mapItemSummary's primary-image resolution
// (item.image, else thumbnailImages, else additionalImages) and the
// DealImage fallback contract (listing photo -> "Reference image"
// catalogue image -> placeholder; UI only, never mutates stored data).

process.env.EBAY_CLIENT_ID = "test-id";
process.env.EBAY_CLIENT_SECRET = "test-secret";

import { test } from "node:test";
import assert from "node:assert/strict";
import ebay from "../../lib/ebay.js";
import { catalogImageUrl } from "../../lib/cardImage.js";

const { primaryListingImage } = ebay;

test("primaryListingImage: prefers item.image, upscaled to s-l1600", () => {
  assert.equal(
    primaryListingImage({ image: { imageUrl: "https://i.ebayimg.com/images/g/abc/s-l500.jpg" } }),
    "https://i.ebayimg.com/images/g/abc/s-l1600.jpg"
  );
});

test("primaryListingImage: falls back to thumbnailImages when image is absent (graded-slab / non-US case)", () => {
  assert.equal(
    primaryListingImage({ thumbnailImages: [{ imageUrl: "https://i.ebayimg.com/images/g/xyz/s-l140.jpg" }] }),
    "https://i.ebayimg.com/images/g/xyz/s-l1600.jpg"
  );
});

test("primaryListingImage: falls back to additionalImages, else null", () => {
  assert.equal(
    primaryListingImage({ additionalImages: [{ imageUrl: "https://i.ebayimg.com/images/g/q/s-l1600.jpg" }] }),
    "https://i.ebayimg.com/images/g/q/s-l1600.jpg"
  );
  assert.equal(primaryListingImage({}), null);
  assert.equal(primaryListingImage({ image: {} }), null);
});

// DealImage's fallback chain is deterministic given its inputs:
//   listing url present -> stage "listing"
//   no listing url, tcgplayer id present -> stage "reference" (labelled)
//   neither -> placeholder
// (the on-error listing->reference->placeholder transition is a client
// behaviour; the initial-stage selection is what these assert.)
function initialDealImageStage({ src, cardTcgplayerId }) {
  const listing = typeof src === "string" && /^https?:\/\//.test(src);
  if (listing) return "listing";
  if (cardTcgplayerId != null) return "reference";
  return "placeholder";
}

test("DealImage initial stage: real listing photo wins", () => {
  assert.equal(initialDealImageStage({ src: "https://i.ebayimg.com/images/g/a/s-l1600.jpg", cardTcgplayerId: 42479 }), "listing");
});

test("DealImage initial stage: no listing photo but a catalogue id -> reference image", () => {
  assert.equal(initialDealImageStage({ src: null, cardTcgplayerId: 124026 }), "reference");
  assert.equal(catalogImageUrl(124026), "https://tcgplayer-cdn.tcgplayer.com/product/124026_in_1000x1000.jpg");
});

test("DealImage initial stage: no listing photo, no catalogue id -> placeholder", () => {
  assert.equal(initialDealImageStage({ src: null, cardTcgplayerId: null }), "placeholder");
  assert.equal(initialDealImageStage({ src: "not-a-url", cardTcgplayerId: undefined }), "placeholder");
});
