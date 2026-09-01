// BOUNDED visual counterfeit screening - OUT OF BAND from the scanner.
//
// The deterministic title gate (lib/dealMatching admitsProxyOrCounterfeit)
// misses counterfeits whose listing text is clean - verified on the
// gold/silver METAL-PLATE reproductions of Pikachu & Zekrom GX 184/181
// (deals 4220/4247) and Mewtwo EX 98/99 (deal 12286): title, number, set,
// HP, rarity and eBay aspects all matched the genuine card; only the
// PHOTO gave it away.
//
// Verdicts (see VERDICTS below):
//   MATCH              - photo is (or is consistent with) the genuine
//                        matched printing.
//   COUNTERFEIT_MISMATCH - a FAKE / NOVELTY physical object, not a genuine
//                        card. Requires a COMBINATION of physical-
//                        construction evidence (incompatible medium +
//                        missing print structure + wrong copyright + ...),
//                        NEVER texture/sheen/glare alone. The only verdict
//                        that means "counterfeit" -> authenticity:proxy_or_counterfeit.
//   IDENTITY_MISMATCH  - a genuine, normal paper card, but NOT the
//                        printing/variant we matched it to (wrong set,
//                        number, HP, attacks, language, frame era). The
//                        deal is still wrong, so it is hidden - but as
//                        identity:visual_mismatch, NOT as a counterfeit.
//   UNKNOWN            - not enough evidence. NEVER counterfeit. For a
//                        HIGH-VALUE + EXTREME-DISCOUNT deal, UNKNOWN can
//                        hide it (authenticity:visual_unverified) pending
//                        review.
//
// TWO STAGES:
//   Stage 1 (this file, `sharp` only, cheap): colour/greyscale/hue stats +
//     a difference hash. Can only ever return MATCH (obvious colour
//     consistency) or UNKNOWN. It NEVER returns a mismatch on its own - a
//     clean studio scan vs. an angled sleeved glare-lit photo of the SAME
//     genuine card is too noisy for a pixel-stats mismatch. Its job is to
//     cheaply clear the easy cases so Stage 2 stays small.
//   Stage 2 (`visionClassify`, env-gated): a bounded vision call on the
//     items Stage 1 left UNKNOWN. Returns one of the four verdicts with a
//     short reason. Inert (returns null) with no key -> those items stay
//     UNKNOWN.
//
// EXPLICITLY NOT "gold = fake" / "metal = fake" / "textured = fake".
// Genuine Gold Secret Rares, official metal products, full-art / rainbow /
// cosmos foils and embossed Secret Rares are respected - Stage 1 via
// catalogIsGoldOrMetalProduct, Stage 2 via an explicit non-evidence list
// in the prompt. A heavily-textured genuine foil is MATCH or UNKNOWN,
// never COUNTERFEIT_MISMATCH.

// The Stage-2 verdict vocabulary. Stage 1 only ever emits MATCH / UNKNOWN.
const VERDICTS = {
  MATCH: "MATCH",
  COUNTERFEIT: "COUNTERFEIT_MISMATCH",
  IDENTITY: "IDENTITY_MISMATCH",
  UNKNOWN: "UNKNOWN",
};

const CANDIDATE_MIN_MARKET_USD = 100;
const CANDIDATE_MIN_DISCOUNT = 0.55;

// High-value chase cards ($300+) are the counterfeit target, and the
// gold-metal fakes are priced to move at a substantial but not always
// >=55% discount - deal 12766 (a $664 Charizard GX rainbow rare, a
// verified gold-metal counterfeit) sat at 54.85% off and fell 0.15pp
// short of the general 55% gate, with no trust-signal enrichment to hit
// the thin-listing path. This second, tighter gate (higher value, lower
// discount) closes that class without widening the queue to the long
// tail of ordinary mid-value discounts.
const CANDIDATE_HIGH_VALUE_USD = 300;
const CANDIDATE_HIGH_VALUE_DISCOUNT = 0.4;

// The value/discount band that lib/dealQuality.isPremiumDealEligible
// treats as high-risk: a $100+ card at 40%+ off cannot take a Top 10 /
// Best Finds slot without a completed MATCH visual verdict. So every such
// row must be IN the screening queue - otherwise it can never earn a
// premium slot (deal 12750: $220 Rainbow Rare, 55% off, gold-metal
// counterfeit, sat below the old CANDIDATE_HIGH_VALUE_USD floor).
const CANDIDATE_PREMIUM_USD = 100;
const CANDIDATE_PREMIUM_DISCOUNT = 0.4;

// UNKNOWN only hides a deal from promotion when it is BOTH this valuable
// and this steeply discounted - i.e. exactly the "too good to be true"
// band where a counterfeit is worth making. Ordinary UNKNOWN deals are
// unaffected.
const VISUAL_UNVERIFIED_MIN_MARKET_USD = 100;
const VISUAL_UNVERIFIED_MIN_DISCOUNT = 0.7;

// The species counterfeiters target hardest. A physical bootleg of a real
// chase card (gold-metal plate, laminated proxy, "custom card" novelty)
// is produced at EVERY price point, not just the $100+ band the gates
// above assume. Deal 24195 - a gold-metal-plate "Custom Cards" Charizard
// VMAX novelty carrying a real card id, a clean title and a $47.35
// reference - was never screened at all: its market_price sat below
// CANDIDATE_MIN_MARKET_USD, and its TOTAL discount was only ~16% because
// ~80% of the undercut had been shifted into a padded "shipping" line
// (item price alone ~$22, ~54% below market). For these species we lower
// the value floor to RISK_SPECIES_MIN_MARKET_USD and add an item-price
// (pre-shipping) undercut signal, so a listing whose CARD price is far
// below market can't stay out of the queue behind inflated postage.
// This is ADDITIVE - it only ever routes MORE rows to the out-of-band
// worker; it changes no display gate directly.
const RISK_SPECIES_MIN_MARKET_USD = 25;
const RISK_SPECIES_MIN_DISCOUNT = 0.4;
const RISK_SPECIES_MIN_ITEM_GAP = 0.45;
// The item-gap arm targets the deal-24195 shape SPECIFICALLY: the
// pre-shipping card price is far below market while the headline discount
// looks tame because the undercut was moved into shipping. A plainly
// discounted card (gap ~= discount) is already covered by the discount
// arm, so this arm only fires when the gap materially EXCEEDS the
// headline discount.
const RISK_SPECIES_SHIP_CAMOUFLAGE_SPREAD = 0.15;
// The chase species bootleggers reproduce most - kept deliberately tight
// (the established counterfeit-target set), not "every popular Pokemon".
const HIGH_COUNTERFEIT_RISK_SPECIES = [
  "charizard", "pikachu", "mewtwo", "mew", "umbreon", "rayquaza",
  "lugia", "gengar", "eevee", "blastoise", "venusaur", "sylveon", "espeon",
];
const RISK_SPECIES_RE = new RegExp(`\\b(${HIGH_COUNTERFEIT_RISK_SPECIES.join("|")})\\b`, "i");

function isHighCounterfeitRiskSpecies(row) {
  return RISK_SPECIES_RE.test(String(row?.card_name ?? ""));
}

// Fraction by which the listing's PRE-SHIPPING item price sits below the
// market reference, in USD. null when the inputs don't allow a
// trustworthy split. The stored USD total is apportioned by the native
// item/total ratio (no second FX lookup); a listing that is item-only
// (no separable shipping, or shipping >= item) yields the same as the
// ordinary discount and simply won't add anything.
function itemPriceVsMarketGap(row) {
  const market = Number(row?.market_price);
  const totalUsd = Number(row?.total_price_usd ?? row?.total_price);
  const totalNative = Number(row?.total_price);
  const itemNative = Number(row?.price);
  if (!(market > 0) || !(totalUsd > 0) || !(totalNative > 0) || !(itemNative >= 0)) return null;
  const itemUsd = itemNative >= totalNative ? totalUsd : totalUsd * (itemNative / totalNative);
  return 1 - itemUsd / market;
}

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
  if (!Number.isFinite(market)) return false;
  const riskSpecies = isHighCounterfeitRiskSpecies(row);
  const marketFloor = riskSpecies ? RISK_SPECIES_MIN_MARKET_USD : CANDIDATE_MIN_MARKET_USD;
  if (market < marketFloor) return false;

  const discount = Number(row.discount_pct);
  const steep = Number.isFinite(discount) && discount >= CANDIDATE_MIN_DISCOUNT;
  // A high-value chase card at a materially below-market price - the exact
  // counterfeit target. Independent of trust-signal enrichment (which is
  // null on rows ingested before those columns existed).
  const highValueDiscounted =
    market >= CANDIDATE_HIGH_VALUE_USD &&
    Number.isFinite(discount) &&
    discount >= CANDIDATE_HIGH_VALUE_DISCOUNT;
  // Premium-placement high-risk band - screened so it can be verified for
  // (or kept out of) Top 10 / Best Finds.
  const premiumRisk =
    market >= CANDIDATE_PREMIUM_USD &&
    Number.isFinite(discount) &&
    discount >= CANDIDATE_PREMIUM_DISCOUNT;
  const priceRefFlagged = row.disqualified_reason === "reference:price_unverified";
  const trustFlagged = row.disqualified_reason === "trust:high_risk_below_market";
  const thinListing =
    row.seller_feedback_score != null && row.seller_feedback_score < 250 &&
    row.image_count != null && row.image_count <= 2 &&
    row.returns_accepted === false;

  // High-counterfeit-risk species in the sub-$100 band the value gates
  // above don't reach, EITHER visibly discounted OR with the pre-shipping
  // card price sitting well below market (the deal-24195 shipping-camouflage
  // shape). Above CANDIDATE_MIN_MARKET_USD the ordinary gates already apply.
  const itemGap = itemPriceVsMarketGap(row);
  const shippingCamouflage =
    itemGap != null &&
    itemGap >= RISK_SPECIES_MIN_ITEM_GAP &&
    itemGap - (Number.isFinite(discount) ? discount : 0) >= RISK_SPECIES_SHIP_CAMOUFLAGE_SPREAD;
  const riskSpeciesUndervalued =
    riskSpecies &&
    market < CANDIDATE_MIN_MARKET_USD &&
    ((Number.isFinite(discount) && discount >= RISK_SPECIES_MIN_DISCOUNT) || shippingCamouflage);

  return (
    steep ||
    highValueDiscounted ||
    premiumRisk ||
    priceRefFlagged ||
    trustFlagged ||
    thinListing ||
    riskSpeciesUndervalued
  );
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
// status one of VERDICTS.*, or null when unavailable (no key / error /
// unparseable) so the caller keeps UNKNOWN.
const VISION_MODEL = process.env.VISION_MODEL || "claude-sonnet-5";
const VISION_ENDPOINT = "https://api.anthropic.com/v1/messages";

// The Stage-2 instruction. Extracted + exported so a test can lock the
// non-evidence list and the "counterfeit needs a COMBINATION" rule in
// place - those are what stop a genuine textured/embossed/holo foil (e.g.
// Umbreon delta 17/113, Dialga EX 122/119 SR) being called counterfeit.
function visionPrompt(card) {
  return (
    `Image 1 is the CANONICAL scan of a Pokemon TCG card: ${card?.name ?? "?"} (${card?.set ?? "?"}).\n` +
    `Image 2 is a marketplace seller's photo claiming to be that exact card / printing.\n\n` +
    `Classify image 2 into EXACTLY ONE of:\n` +
    `  MATCH             - image 2 is, or is consistent with, the same genuine printing as image 1.\n` +
    `  COUNTERFEIT       - image 2 is a FAKE or NOVELTY object, not a genuine Pokemon TCG card.\n` +
    `  IDENTITY_MISMATCH - image 2 is a genuine, normal paper Pokemon card, but a DIFFERENT\n` +
    `                      card / printing / variant than image 1 (different set, collector\n` +
    `                      number, HP, attacks, rarity treatment, language, or frame era).\n` +
    `  UNKNOWN           - you cannot tell.\n\n` +
    `COUNTERFEIT requires a COMBINATION of physical-construction evidence, e.g.:\n` +
    `  - incompatible medium: a metal / plastic / wood plate, a laminated print, a sticker\n` +
    `  - normal print structure ABSENT: no halftone / rosette dot pattern, no printed border\n` +
    `    layer, a flat solid-colour field where the real card has a printed illustration\n` +
    `  - engraved / etched / relief text standing proud of the surface, or illegible\n` +
    `    machine-etched lettering\n` +
    `  - a wrong or fabricated copyright / date line (e.g. (c)2020 on a 2017 set)\n` +
    `  - a frame / layout / element geometry no real printing uses\n` +
    `  - non-paper construction: metallic sheen across the WHOLE card, a mirror finish\n` +
    `Do NOT answer COUNTERFEIT on any of these ALONE - they are ALL normal on genuine cards:\n` +
    `  holo / rainbow / cosmos foil sheen, full-art or textured foil, embossed genuine foil,\n` +
    `  gold Secret Rare or official metal promo, sleeve glare, angled light, reflections,\n` +
    `  rounded corners, perspective / keystoning, colour cast, white balance, JPEG artefacts,\n` +
    `  print lines, whitening, edge or surface wear.\n` +
    `If image 2 looks like a real paper card but simply is not the SAME card as image 1,\n` +
    `that is IDENTITY_MISMATCH, not COUNTERFEIT.\n` +
    `If you cannot establish counterfeit construction, and cannot decide MATCH vs\n` +
    `IDENTITY_MISMATCH, answer UNKNOWN.\n\n` +
    `Respond with ONLY one JSON object: {"verdict":"MATCH|COUNTERFEIT|IDENTITY_MISMATCH|UNKNOWN","reason":"<short>"}`
  );
}

async function visionClassify({ canonicalUrl, listingUrl, card }) {
  const key = process.env.VISION_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key || !canonicalUrl || !listingUrl) return null;

  const prompt = visionPrompt(card);

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
    const raw = String(parsed.verdict || "").toUpperCase().replace(/[\s-]+/g, "_");
    const status = normalizeVisionVerdict(raw);
    if (!status) return null;
    return { status, reason: `vision:${String(parsed.reason || "").slice(0, 180)}` };
  } catch {
    return null;
  }
}

// Map whatever the model returns onto the four-verdict taxonomy. A bare
// "MISMATCH" (or any "not the same" answer with no counterfeit evidence)
// is treated as IDENTITY_MISMATCH, never counterfeit - the accusatory
// verdict has to be earned explicitly.
function normalizeVisionVerdict(raw) {
  if (raw === "MATCH") return VERDICTS.MATCH;
  if (raw === "UNKNOWN") return VERDICTS.UNKNOWN;
  if (["COUNTERFEIT", "COUNTERFEIT_MISMATCH", "FAKE", "PROXY", "NOVELTY"].includes(raw))
    return VERDICTS.COUNTERFEIT;
  if (["IDENTITY_MISMATCH", "IDENTITY", "WRONG_CARD", "WRONG_PRINTING", "MISMATCH"].includes(raw))
    return VERDICTS.IDENTITY;
  return null;
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
    return { status: VERDICTS.UNKNOWN, reason: `fetch_failed:${e.message?.slice(0, 80)}` };
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
    return { status: VERDICTS.MATCH, reason: `stage1 ${stage1.reason}${hashNote}` };
  }

  // Stage 1 UNKNOWN -> try Stage 2. Stage 2 owns the mismatch verdicts;
  // Stage 1 can never accuse on its own.
  const v = await vision({ canonicalUrl, listingUrl: row.image_url, card });
  const tail = ` | stage1 ${stage1.reason}${hashNote}`;
  if (v && v.status === VERDICTS.COUNTERFEIT) return { status: VERDICTS.COUNTERFEIT, reason: `${v.reason}${tail}` };
  if (v && v.status === VERDICTS.IDENTITY) return { status: VERDICTS.IDENTITY, reason: `${v.reason}${tail}` };
  if (v && v.status === VERDICTS.MATCH) return { status: VERDICTS.MATCH, reason: `${v.reason}${tail}` };
  if (v && v.status === VERDICTS.UNKNOWN) return { status: VERDICTS.UNKNOWN, reason: `${v.reason}${tail}` };

  return { status: VERDICTS.UNKNOWN, reason: `stage1 ${stage1.reason}${hashNote}${v === null ? " | vision_unavailable" : ""}` };
}

module.exports = {
  VERDICTS,
  CANDIDATE_MIN_MARKET_USD,
  CANDIDATE_MIN_DISCOUNT,
  CANDIDATE_HIGH_VALUE_USD,
  CANDIDATE_HIGH_VALUE_DISCOUNT,
  CANDIDATE_PREMIUM_USD,
  CANDIDATE_PREMIUM_DISCOUNT,
  VISUAL_UNVERIFIED_MIN_MARKET_USD,
  VISUAL_UNVERIFIED_MIN_DISCOUNT,
  RISK_SPECIES_MIN_MARKET_USD,
  RISK_SPECIES_MIN_DISCOUNT,
  RISK_SPECIES_MIN_ITEM_GAP,
  RISK_SPECIES_SHIP_CAMOUFLAGE_SPREAD,
  HIGH_COUNTERFEIT_RISK_SPECIES,
  isHighCounterfeitRiskSpecies,
  itemPriceVsMarketGap,
  isVisualScreeningCandidate,
  visualUnverifiedShouldHide,
  imageColorStats,
  dHash,
  hammingHex,
  catalogIsGoldOrMetalProduct,
  classifyStage1,
  normalizeVisionVerdict,
  visionPrompt,
  visionClassify,
  screenDeal,
};
