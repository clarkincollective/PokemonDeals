// lib/cardImage - the catalogue image size-token upgrade. Same product id
// (same printing) at a larger derivative; never a different card.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG_IMAGE_TOKEN, catalogImageUrl, upgradeCatalogImage } from "../../lib/cardImage.js";

test("catalogImageUrl builds the large-derivative URL for a product id", () => {
  assert.equal(
    catalogImageUrl("42382"),
    "https://tcgplayer-cdn.tcgplayer.com/product/42382_in_1000x1000.jpg"
  );
  assert.equal(catalogImageUrl(509836), "https://tcgplayer-cdn.tcgplayer.com/product/509836_in_1000x1000.jpg");
  assert.equal(catalogImageUrl(null), null);
});

test("upgradeCatalogImage bumps every small TCGplayer derivative to the large one", () => {
  const big = "https://tcgplayer-cdn.tcgplayer.com/product/42382_in_1000x1000.jpg";
  for (const small of [
    "https://tcgplayer-cdn.tcgplayer.com/product/42382_in_200x200.jpg",
    "https://tcgplayer-cdn.tcgplayer.com/product/42382_in_400x400.jpg",
    "https://tcgplayer-cdn.tcgplayer.com/product/42382_200w.jpg",
    "https://tcgplayer-cdn.tcgplayer.com/product/42382.jpg",
  ]) {
    assert.equal(upgradeCatalogImage(small), big, small);
  }
});

test("upgradeCatalogImage is idempotent on an already-large URL", () => {
  const big = "https://tcgplayer-cdn.tcgplayer.com/product/42382_in_1000x1000.jpg";
  assert.equal(upgradeCatalogImage(big), big);
});

test("upgradeCatalogImage NEVER touches a non-TCGplayer URL", () => {
  for (const other of [
    "https://i.ebayimg.com/images/g/abcAAOSw/s-l1600.jpg",
    "https://images.pokemontcg.io/base1/4_hires.png",
    "https://example.com/product/42382_in_200x200.jpg", // right path, wrong host
    null,
    undefined,
    "",
  ]) {
    assert.equal(upgradeCatalogImage(other), other);
  }
});

test("upgradeCatalogImage preserves a query string", () => {
  assert.equal(
    upgradeCatalogImage("https://tcgplayer-cdn.tcgplayer.com/product/42382_in_200x200.jpg?v=2"),
    "https://tcgplayer-cdn.tcgplayer.com/product/42382_in_1000x1000.jpg?v=2"
  );
});

test("the stored token is the 1000-box derivative", () => {
  assert.equal(CATALOG_IMAGE_TOKEN, "_in_1000x1000.jpg");
});
