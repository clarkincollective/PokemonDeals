// P0 DEAL IMAGE INTEGRITY - the sharp-backed card-back DETECTOR. Kept
// separate from lib/listingImage (the pure selection contract) so the
// client bundle never pulls in `sharp`. Imported ONLY by the out-of-band
// worker (app/api/screen-deal-images) and the remediation script.
//
// The modern Pokemon card back is a single fixed design. In the card
// region it always has, invariant to lighting / crop / mild rotation /
// JPEG recompression:
//   - a central Poke Ball: upper hemisphere RED, lower hemisphere WHITE
//   - a navy / indigo border ring
//   - a yellow "Pokemon" wordmark band near the top AND another near the
//     bottom (180-rotated), both yellow
// Four cheap structural features, ALL required (see
// lib/listingImage.isCardBackFeatures). Calibrated to 0 false positives
// over 250 real front photos; fires on the target plus brightness / blur /
// recompression variants. Heavily rotated backs can slip through -
// acceptable: a missed back is not a data-integrity failure, whereas a
// wrongly-hidden front (showing canonical art instead) is only a cosmetic
// downgrade. NO vision call, NO AI generation.

const { IMAGE_VERDICT, isCardBackFeatures } = require("./listingImage");

// Decode `buffer` and measure the four structural features. Returns null
// when sharp is unavailable or the buffer can't be decoded - the caller
// then treats the image as an ordinary seller front, never as a back on a
// failed read.
async function cardBackFeatures(buffer) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    return null;
  }
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return null;
  }
  const W = meta.width || 0;
  const H = meta.height || 0;
  if (W < 24 || H < 24) return null;

  // Hard centre crop to the likely card region (drop table / background
  // margins). 62% x 80% matches how marketplace card photos are framed.
  const cw = Math.round(W * 0.62);
  const ch = Math.round(H * 0.8);
  const ex = { left: Math.round((W - cw) / 2), top: Math.round((H - ch) / 2), width: cw, height: ch };

  const S = 64;
  let data;
  try {
    ({ data } = await sharp(buffer)
      .extract(ex)
      .resize(S, S, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }));
  } catch {
    return null;
  }
  const at = (x, y) => {
    const i = (y * S + x) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const redness = (r, g, b) => r - (g + b) / 2;
  const bright = (r, g, b) => (r + g + b) / 3;
  const yellowness = (r, g, b) => Math.min(r, g) - b;

  // Poke Ball: centre 36% box, top half vs bottom half.
  const c0 = Math.round(S * 0.32);
  const c1 = Math.round(S * 0.68);
  const half = (c0 + c1) / 2;
  let tR = 0, bR = 0, tB = 0, bB = 0, nT = 0, nB = 0;
  for (let y = c0; y < c1; y++) {
    for (let x = c0; x < c1; x++) {
      const [r, g, b] = at(x, y);
      if (y < half) {
        tR += redness(r, g, b);
        tB += bright(r, g, b);
        nT++;
      } else {
        bR += redness(r, g, b);
        bB += bright(r, g, b);
        nB++;
      }
    }
  }
  const ballRed = tR / nT - bR / nB;
  const ballBri = bB / nB - tB / nT;

  // "Pokemon" wordmark bands near the top and bottom - both yellow on the
  // card back; take the LESS yellow of the two.
  const band = (y0, y1) => {
    let yl = 0, n = 0;
    for (let y = Math.round(S * y0); y < Math.round(S * y1); y++) {
      for (let x = Math.round(S * 0.15); x < Math.round(S * 0.85); x++) {
        const [r, g, b] = at(x, y);
        yl += yellowness(r, g, b);
        n++;
      }
    }
    return yl / n;
  };
  const wmMirror = Math.min(band(0.13, 0.28), band(0.72, 0.87));

  // Navy border ring.
  let bl = 0, n = 0;
  const t = Math.round(S * 0.05);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (x < t || x >= S - t || y < t || y >= S - t) {
        const [r, g, b] = at(x, y);
        bl += b - Math.max(r, g);
        n++;
      }
    }
  }
  const borderBlue = bl / n;

  return {
    ballRed: +ballRed.toFixed(2),
    ballBri: +ballBri.toFixed(2),
    wmMirror: +wmMirror.toFixed(2),
    borderBlue: +borderBlue.toFixed(2),
  };
}

// Decode + classify ONE image. Only ever positively asserts CARD_BACK;
// any other decodable image is reported as a usable seller front.
async function classifyListingImage(buffer) {
  const features = await cardBackFeatures(buffer);
  if (features && isCardBackFeatures(features)) {
    return { verdict: IMAGE_VERDICT.CARD_BACK, features };
  }
  return { verdict: IMAGE_VERDICT.SELLER_FRONT, features: features ?? null };
}

module.exports = { cardBackFeatures, classifyListingImage };
