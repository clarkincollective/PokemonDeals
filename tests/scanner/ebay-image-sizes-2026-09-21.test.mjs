// 2026-09-21 - Lighthouse put the homepage at 8,750 KiB on mobile, with
// 3,296 KiB of it images served far larger than they are displayed. Deal
// cards show a listing photo at 116 CSS px and were downloading eBay's
// 1600 px original (measured: 853 KB for one thumbnail) because eBay
// photos bypass the optimizer and so carried no srcset.
//
// Two things must stay true together, and this file pins both:
//   1. the RENDER asks the CDN for a width near the display size;
//   2. the STORED url is still the 1600 px original, because that is the
//      counterfeit-screening worker's evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ebayImageAt, ebaySrcSet, isEbayImage, EBAY_WIDTHS, EBAY_FALLBACK_WIDTH } from "../../lib/ebayImageSizes.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const SAMPLE = "https://i.ebayimg.com/images/g/ZTYAAeSw04pqqtk8/s-l1600.jpg";

test("isEbayImage recognises the CDN and nothing else", () => {
  assert.equal(isEbayImage(SAMPLE), true);
  assert.equal(isEbayImage("https://tcgplayer-cdn.tcgplayer.com/product/1.jpg"), false);
  assert.equal(isEbayImage("https://notebayimg.com/x/s-l1600.jpg"), false);
  for (const bad of [null, undefined, 42, ""]) assert.equal(isEbayImage(bad), false);
});

test("ebayImageAt swaps only the size suffix, keeping path and extension", () => {
  assert.equal(ebayImageAt(SAMPLE, 300), "https://i.ebayimg.com/images/g/ZTYAAeSw04pqqtk8/s-l300.jpg");
  assert.equal(ebayImageAt(SAMPLE, 1600), SAMPLE);
  assert.equal(ebayImageAt("https://i.ebayimg.com/images/g/ID/s-l225.webp", 400), "https://i.ebayimg.com/images/g/ID/s-l400.webp");
});

test("a url it cannot resize comes back untouched, never guessed at", () => {
  const foreign = "https://tcgplayer-cdn.tcgplayer.com/product/1_200w.jpg";
  assert.equal(ebayImageAt(foreign, 300), foreign);
  assert.equal(ebaySrcSet(foreign), null);
  const noSuffix = "https://i.ebayimg.com/images/g/ID/photo.jpg";
  assert.equal(ebayImageAt(noSuffix, 300), noSuffix);
  assert.equal(ebaySrcSet(noSuffix), null);
  for (const bad of [null, undefined, 0, -5, NaN]) assert.equal(ebayImageAt(SAMPLE, bad), SAMPLE);
});

test("the srcset covers the measured widths in ascending order, each with its w descriptor", () => {
  const set = ebaySrcSet(SAMPLE);
  assert.ok(set, "srcset produced");
  const parts = set.split(", ");
  assert.equal(parts.length, EBAY_WIDTHS.length);
  const widths = parts.map((p) => Number(p.split(" ")[1].replace("w", "")));
  assert.deepEqual(widths, [...EBAY_WIDTHS].sort((a, b) => a - b), "ascending, no duplicates");
  for (const [i, p] of parts.entries()) {
    const [url, desc] = p.split(" ");
    assert.equal(desc, `${EBAY_WIDTHS[i]}w`);
    assert.match(url, new RegExp(`/s-l${EBAY_WIDTHS[i]}\\.jpg$`));
  }
});

// Every width here returned HTTP 200 with a genuinely different payload
// when probed on 2026-09-21. Nothing outside that measured set may be
// requested - an unverified suffix could 404 and blank a deal card.
test("only widths verified against the CDN are ever requested", () => {
  const VERIFIED = [225, 300, 400, 500, 640, 800, 960, 1200, 1600];
  for (const w of EBAY_WIDTHS) assert.ok(VERIFIED.includes(w), `s-l${w} was never verified against the CDN`);
  assert.ok(VERIFIED.includes(EBAY_FALLBACK_WIDTH), "the src fallback width is verified too");
  assert.ok(Math.max(...EBAY_WIDTHS) === 1600, "the largest candidate stays the stored original");
});

test("the smallest candidate is a real saving over the stored original", () => {
  // 116 CSS px cards at 2x want ~232 px, so the set must reach well below
  // 1600 or the fix does nothing on the surface that needed it.
  assert.ok(Math.min(...EBAY_WIDTHS) <= 300, "no candidate small enough for a phone card");
  assert.ok(EBAY_FALLBACK_WIDTH < 1600, "the no-srcset fallback must not be the full original");
});

test("DealImage renders eBay photos with the responsive set, and keeps the optimizer for catalogue art", () => {
  const src = read("components/DealImage.js");
  assert.match(src, /srcSet=\{srcSet/, "eBay photos carry a srcset");
  assert.match(src, /sizes=\{srcSet \? sizes : undefined\}/, "sizes only when a srcset exists");
  assert.match(src, /ebayImageAt\(current, EBAY_FALLBACK_WIDTH\)/, "src itself is downscaled");
  assert.doesNotMatch(src, /unoptimized=/, "the dead unoptimized prop is gone");
  assert.match(src, /absolute inset-0 h-full w-full/, "the bare img still fills the aspect-ratio box");
  // The fallback chain and its honesty label must survive the new branch.
  assert.match(src, /Reference image/, "the reference-image label is still rendered");
  assert.ok((src.match(/setStage\(/g) ?? []).length >= 2, "both branches keep the one-way fallback");
});

test("the stored listing url is still the full-size screening evidence", () => {
  const links = read("lib/ebayLinks.js");
  assert.match(links, /s-l1600/, "ebayLinks still stores the 1600 px original");
  assert.doesNotMatch(links, /ebayImageSizes/, "render-time sizing must not leak into what is stored");
});
