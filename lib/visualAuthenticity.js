// BOUNDED visual counterfeit screening - OUT OF BAND from the scanner.
//
// The deterministic title gate (lib/dealMatching admitsProxyOrCounterfeit)
// misses counterfeits whose listing text is clean - verified on the
// gold/silver METAL-PLATE reproductions of Pikachu & Zekrom GX 184/181
// (deals 4220/4247) and Mewtwo EX 98/99 (deal 12286): title, number, set,
// HP, rarity and eBay aspects all matched the genuine card; only the
// PHOTO gave it away.
//
// Verdicts:
//   MATCH    - photo is colour-consistent with the genuine printing
//   MISMATCH - strong structural evidence it is NOT that printing
//              (ONLY this auto-rejects -> authenticity:proxy_or_counterfeit)
//   UNKNOWN  - not enough evidence. NEVER counterfeit. For a HIGH-VALUE +
//              EXTREME-DISCOUNT deal, UNKNOWN can hide it from promotion
//              (authenticity:visual_unverified) pending review.
//
// TWO STAGES:
//   Stage 1 (this file, `sharp` only, cheap): colour/greyscale/hue stats +
//     a difference hash. Can only ever return MATCH (obvious colour
//     consistency) or UNKNOWN. It NEVER returns MISMATCH on its own - a
//     clean studio scan vs. an angled sleeved glare-lit photo of the SAME
//     genuine card is too noisy for a pixel-stats MISMATCH. Its job is to
//     cheaply clear the easy cases so Stage 2 stays small.
//   Stage 2 (`visionClassify`, env-gated): a bounded vision call on the
//     items Stage 1 left UNKNOWN. Returns MATCH / MISMATCH / UNKNOWN with
//     a structural reason. Inert (returns null) with no key -> those
//     items stay UNKNOWN.
//
// EXPLICITLY NOT "gold = fake" / "metal = fake". Genuine Gold Secret Rares
// and official metal products are respected via catalogIsGoldOrMetalProduct.

const CANDIDATE_MIN_MARKET_USD = 100;
const CANDIDATE_MIN_DISCOUNT = 0.55;

// UNKNOWN only hides a deal from promotion when it is BOTH this valuable
// and this steeply discounted - i.e. exactly the "too good to be true"
// band where a counterfeit is worth making. Ordinary UNKNOWN deals are
// unaffected.
const VISUAL_UNVERIFIED_MIN_MARKET_USD = 100;
const VISUAL_UNVERIFIED_MIN_DISCOUNT = 0.7;

// A deal enters the visual queue when it is a valuable raw single AND
// carries at least one independent "too good to be true" signal.
// Permissive on WHICH signal, hard-bounded by value + raw-single so the
// queue stays small.
function isVisualScreeningCandidate(row) {
  if (!row) return false;
  if (row.is_graded) return false;
  if (!row.card_tcgplayer_id) return false; // no canonical reference possible
  if (!row.image_url || !/^https?:\/\//.test(String(row.image_url))) return false;
  const market = Number(row.market_price);
  if (!Number.isFinite(market) || market < CANDIDATE_MIN_MARKET_USD) return false;

  const discount = Number(row.discount_pct);
  const steep = Number.isFinite(discount) && discount >= CANDIDATE_MIN_DISCOUNT;
  const priceRefFlagged = row.disqualified_reason === "reference:price_unverified";
  const trustFlagged = row.disqualified_reason === "trust:high_risk_below_market";
  const thinListing =
    row.seller_feedback_score != null && row.seller_feedback_score < 250 &&
    row.image_count != null && row.image_count <= 2 &&
    row.returns_accepted === false;

  return steep || priceRefFlagged || trustFlagged || thinListing;
}

// True when UNKNOWN should hide the deal from promotion.
function visualUnverifiedShouldHide(row) {
  return (
    Number(row?.market_price) >= VISUAL_UNVERIFIED_MIN_MARKET_USD &&
    Number(row?.discount_pct) >= VISUAL_UNVERIFIED_MIN_DISCOUNT
  );
}

// --- Stage 1: image statistics (sharp) ---------------------------------

// Hasler-Süsstrunk colourfulness + mean saturation/value + fraction of
// near-greyscale pixels + fraction in the warm "metallic" hue band, on a
// 96px thumbnail. null if the buffer can't be decoded.
async function imageColorStats(buffer) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    return null;
  }
  let data, info;
  try {
    ({ data, info } = await sharp(buffer)
      .resize(96, 96, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }));
  } catch {
    return null;
  }
  const px = info.width * info.height;
  if (px === 0) return null;

  let sumRG = 0, sumYB = 0, sumRG2 = 0, sumYB2 = 0;
  let sumSat = 0, sumVal = 0, grayish = 0, metallicHue = 0;

  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    sumRG += rg; sumYB += yb; sumRG2 += rg * rg; sumYB2 += yb * yb;

    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    sumVal += max / 255;
    sumSat += max === 0 ? 0 : d / max;
    if (d <= 22) grayish++;

    if (d > 12) {
      let hue;
      if (max === r) hue = 60 * (((g - b) / d) % 6);
      else if (max === g) hue = 60 * ((b - r) / d + 2);
      else hue = 60 * ((r - g) / d + 4);
      if (hue < 0) hue += 360;
      if (hue >= 20 && hue <= 60) metallicHue++;
    }
  }

  const muRG = sumRG / px, muYB = sumYB / px;
  const varRG = sumRG2 / px - muRG * muRG;
  const varYB = sumYB2 / px - muYB * muYB;
  const colorfulness =
    Math.sqrt(Math.max(0, varRG) + Math.max(0, varYB)) + 0.3 * Math.sqrt(muRG * muRG + muYB * muYB);

  return {
    colorfulness,
    meanSaturation: sumSat / px,
    meanValue: sumVal / px,
    grayFraction: grayish / px,
    metallicHueFraction: metallicHue / px,
  };
}

// 64-bit difference hash (hex). SUPPORTING signal only - logged, never
// decisive (huge for genuine angled photos too).
async function dHash(buffer) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    return null;
  }
  try {
    const { data } = await sharp(buffer).resize(9, 8, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
    let bits = "";
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) bits += data[row * 9 + col] > data[row * 9 + col + 1] ? "1" : "0";
    return BigInt("0b" + bits).toString(16).padStart(16, "0");
  } catch {
    return null;
  }
}

function hammingHex(a, b) {
  if (!a || !b) return null;
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let n = 0;
  while (x > 0n) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

function catalogIsGoldOrMetalProduct(card) {
  const hay = `${card?.name ?? ""} ${card?.rarity ?? ""} ${card?.card_type ?? ""}`.toLowerCase();
  return /\b(gold|metal)\b/.test(hay);
}

// Stage-1 verdict (PURE - unit-testable with synthetic stats). MATCH or
// UNKNOWN only. Calibrated on the confirmed counterfeits + a genuine
// negative set (Full Art / Alt Art / Secret / vintage): the counterfeits'
// listing photos are NOT reliably separable from genuine cards shot on
// dark/plain backgrounds by colour alone, so Stage 1 deliberately does
// not attempt MISMATCH - it only clears the unambiguous genuine case.
const CLEAR_RATIO = 0.7;        // listing >= 70% as colourful as the canonical ...
const CLEAR_METAL_HUE = 0.35;   // ... and not hue-dominated by warm metal ...
const CLEAR_GRAY = 0.4;         // ... and not mostly greyscale
function classifyStage1(canonStats, listStats, card) {
  if (!canonStats || !listStats) return { status: "UNKNOWN", reason: "stats_unavailable" };
  if (catalogIsGoldOrMetalProduct(card)) {
    // A gold/metal genuine printing - Stage 1's colour logic doesn't
    // apply. Leave it to Stage 2 / stay UNKNOWN.
    return { status: "UNKNOWN", reason: "genuine_printing_is_metal_or_gold" };
  }
  const ratio = canonStats.colorfulness > 0 ? listStats.colorfulness / canonStats.colorfulness : 0;
  if (
    ratio >= CLEAR_RATIO &&
    listStats.metallicHueFraction < CLEAR_METAL_HUE &&
    listStats.grayFraction < CLEAR_GRAY
  ) {
    return {
      status: "MATCH",
      reason: `colour_consistent ratio=${ratio.toFixed(2)} metalHue=${listStats.metallicHueFraction.toFixed(2)} gray=${listStats.grayFraction.toFixed(2)}`,
    };
  }
  return {
    status: "UNKNOWN",
    reason: `stage1_inconclusive ratio=${ratio.toFixed(2)} list_cf=${listStats.colorfulness.toFixed(1)} metalHue=${listStats.metallicHueFraction.toFixed(2)} gray=${listStats.grayFraction.toFixed(2)}`,
  };
}

// --- Stage 2: bounded vision escalation (env-gated) --------------------

// Anthropic Messages API via plain fetch - no SDK dependency. Called ONLY
// for queue items Stage 1 left UNKNOWN. Returns { status, reason } with
// status in MATCH | MISMATCH | UNKNOWN, or null when unavailable
// (no key / error / unparseable) so the caller keeps UNKNOWN.
const VISION_MODEL = process.env.VISION_MODEL || "claude-sonnet-5";
const VISION_ENDPOINT = "https://api.anthropic.com/v1/messages";

async function visionClassify({ canonicalUrl, listingUrl, card }) {
  const key = process.env.VISION_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key || !canonicalUrl || !listingUrl) return null;

  const prompt =
    `Image 1 is the CANONICAL scan of a Pokemon TCG card: ${card?.name ?? "?"} (${card?.set ?? "?"}). ` +
    `Image 2 is a marketplace seller's photo claiming to be that exact card/printing.\n\n` +
    `Decide ONLY whether the physical card in image 2 STRUCTURALLY corresponds to the genuine printing in image 1.\n` +
    `MISMATCH means strong structural evidence it is NOT the genuine printing: different physical construction ` +
    `(e.g. an engraved metal plate where the real card is paper), different card frame/border geometry, ` +
    `different background/design, artwork merely copied onto novelty stock, structurally wrong HP/name/collector-number ` +
    `placement, fake embossed/etched text, obvious proxy/custom design.\n` +
    `Do NOT treat minor colour shift, glare, sleeve tint, camera angle, compression or lighting as MISMATCH.\n` +
    `If you cannot tell, answer UNKNOWN.\n\n` +
    `Respond with ONLY one JSON object: {"verdict":"MATCH|MISMATCH|UNKNOWN","reason":"<short>"}`;

  try {
    const res = await fetch(VISION_ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: canonicalUrl } },
              { type: "image", source: { type: "url", url: listingUrl } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const text = (body?.content ?? []).map((c) => c.text || "").join(" ");
    const m = text.match(/\{[^{}]*"verdict"[^{}]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const v = String(parsed.verdict || "").toUpperCase();
    if (!["MATCH", "MISMATCH", "UNKNOWN"].includes(v)) return null;
    return { status: v, reason: `vision:${String(parsed.reason || "").slice(0, 180)}` };
  } catch {
    return null;
  }
}

// --- orchestrator (deps injected for testability) --------------------

// fetchImage(url) -> Promise<Buffer>. vision(...) -> Promise<{status,reason}|null>.
// Returns { status, reason } - the value to persist as
// visual_authenticity_status / _reason.
async function screenDeal(
  { row, canonicalUrl },
  { fetchImage, vision = visionClassify } = {}
) {
  const card = { name: row.card_name, set: row.card_set, rarity: row.card_rarity };
  let canonBuf, listBuf;
  try {
    [canonBuf, listBuf] = await Promise.all([fetchImage(canonicalUrl), fetchImage(row.image_url)]);
  } catch (e) {
    return { status: "UNKNOWN", reason: `fetch_failed:${e.message?.slice(0, 80)}` };
  }

  const [canonStats, listStats] = await Promise.all([imageColorStats(canonBuf), imageColorStats(listBuf)]);
  const stage1 = classifyStage1(canonStats, listStats, card);
  let hashNote = "";
  try {
    const d = hammingHex(await dHash(canonBuf), await dHash(listBuf));
    if (d != null) hashNote = ` dHash=${d}`;
  } catch {
    /* supporting only */
  }

  if (stage1.status === "MATCH") {
    return { status: "MATCH", reason: `stage1 ${stage1.reason}${hashNote}` };
  }

  // Stage 1 UNKNOWN -> try Stage 2.
  const v = await vision({ canonicalUrl, listingUrl: row.image_url, card });
  if (v && v.status === "MISMATCH") return { status: "MISMATCH", reason: `${v.reason} | stage1 ${stage1.reason}${hashNote}` };
  if (v && v.status === "MATCH") return { status: "MATCH", reason: `${v.reason} | stage1 ${stage1.reason}${hashNote}` };
  if (v && v.status === "UNKNOWN") return { status: "UNKNOWN", reason: `${v.reason} | stage1 ${stage1.reason}${hashNote}` };

  return { status: "UNKNOWN", reason: `stage1 ${stage1.reason}${hashNote}${v === null ? " | vision_unavailable" : ""}` };
}

module.exports = {
  CANDIDATE_MIN_MARKET_USD,
  CANDIDATE_MIN_DISCOUNT,
  VISUAL_UNVERIFIED_MIN_MARKET_USD,
  VISUAL_UNVERIFIED_MIN_DISCOUNT,
  isVisualScreeningCandidate,
  visualUnverifiedShouldHide,
  imageColorStats,
  dHash,
  hammingHex,
  catalogIsGoldOrMetalProduct,
  classifyStage1,
  visionClassify,
  screenDeal,
};
