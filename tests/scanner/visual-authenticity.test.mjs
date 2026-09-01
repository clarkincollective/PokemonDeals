// Bounded visual screening (lib/visualAuthenticity) + its wiring into the
// display gate. Two-stage design:
//   Stage 1 (sharp colour/hash) - MATCH or UNKNOWN only, never a mismatch.
//   Stage 2 (vision, env-gated)  - MATCH / COUNTERFEIT_MISMATCH /
//                                  IDENTITY_MISMATCH / UNKNOWN.
// COUNTERFEIT_MISMATCH -> authenticity:proxy_or_counterfeit (fake object).
// IDENTITY_MISMATCH    -> identity:visual_mismatch (genuine card, wrong
//                         printing/variant than the one we matched).
// UNKNOWN, only when vision actually ran AND high-value + extreme-discount
//   -> authenticity:visual_unverified. A Stage-1-only UNKNOWN never hides.
// Legacy bare "MISMATCH" (pre-taxonomy rows) still -> proxy_or_counterfeit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isVisualScreeningCandidate,
  classifyStage1,
  imageColorStats,
  screenDeal,
  catalogIsGoldOrMetalProduct,
  normalizeVisionVerdict,
  visionPrompt,
  VERDICTS,
  CANDIDATE_MIN_DISCOUNT,
  CANDIDATE_MIN_MARKET_USD,
  CANDIDATE_HIGH_VALUE_USD,
  CANDIDATE_HIGH_VALUE_DISCOUNT,
  RISK_SPECIES_MIN_MARKET_USD,
  isHighCounterfeitRiskSpecies,
  itemPriceVsMarketGap,
} from "../../lib/visualAuthenticity.js";
import { visualAuthenticityReason, isDisplayableDeal, disqualificationReason } from "../../lib/dealQuality.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "visual");
const img = (n) => readFileSync(join(FIX, n));

// --- Stage 1: real fixtures ------------------------------------------------

test("Stage 1: confirmed METAL-PLATE counterfeits are NOT cleared as MATCH (they go UNKNOWN)", async () => {
  const pikazek = {
    canon: await imageColorStats(img("canonical-pikazek.jpg")),
    list: await imageColorStats(img("counterfeit-pikazek.jpg")),
  };
  const mewtwo = {
    canon: await imageColorStats(img("canonical-mewtwo.jpg")),
    list: await imageColorStats(img("counterfeit-mewtwo.jpg")),
  };
  for (const [name, s, card] of [
    ["pikazek", pikazek, { name: "Pikachu & Zekrom GX (Secret)", set: "SM - Team Up" }],
    ["mewtwo", mewtwo, { name: "Mewtwo EX (98 Full Art)", set: "Next Destinies" }],
  ]) {
    const v = classifyStage1(s.canon, s.list, card);
    assert.equal(v.status, "UNKNOWN", `${name}: Stage 1 clears nothing and accuses nothing`);
  }
});

test("Stage 1: a bright straight-on GENUINE Full Art photo can be cleared as MATCH", async () => {
  const v = classifyStage1(
    await imageColorStats(img("canonical-umbreon-fa.jpg")),
    await imageColorStats(img("genuine-umbreon-fa.jpg")),
    { name: "Umbreon GX (Full Art)", set: "SM Base Set" }
  );
  assert.equal(v.status, "MATCH");
});

test("Stage 1: a GENUINE card in a sleeve / off-angle is UNKNOWN or MATCH, never a mismatch", async () => {
  const v = classifyStage1(
    await imageColorStats(img("canonical-tapulele.jpg")),
    await imageColorStats(img("genuine-tapulele-sleeved.jpg")),
    { name: "Tapu Lele GX (Secret)", set: "SM - Guardians Rising" }
  );
  assert.ok(["MATCH", "UNKNOWN"].includes(v.status));
});

// --- Stage 1: pure logic -------------------------------------------------

test("Stage 1 never accuses on synthetic 'metal sheet' stats (any mismatch verdict is Stage 2 only)", () => {
  const canon = { colorfulness: 80, meanSaturation: 0.4, meanValue: 0.6, grayFraction: 0.1, metallicHueFraction: 0.1 };
  const metalSheet = { colorfulness: 10, meanSaturation: 0.05, meanValue: 0.7, grayFraction: 0.9, metallicHueFraction: 0.6 };
  const v = classifyStage1(canon, metalSheet, { name: "Charizard", set: "Base Set" });
  assert.equal(v.status, "UNKNOWN");
});

test("4/5. a genuine GOLD / METAL official printing -> Stage 1 UNKNOWN, never fake", () => {
  assert.equal(catalogIsGoldOrMetalProduct({ name: "Charizard VMAX", rarity: "Gold Secret Rare" }), true);
  assert.equal(catalogIsGoldOrMetalProduct({ name: "Mew ex", rarity: "Metal Promo" }), true);
  const vivid = { colorfulness: 70, meanSaturation: 0.3, meanValue: 0.6, grayFraction: 0.2, metallicHueFraction: 0.1 };
  const goldPhoto = { colorfulness: 15, meanSaturation: 0.1, meanValue: 0.7, grayFraction: 0.8, metallicHueFraction: 0.7 };
  const v = classifyStage1(vivid, goldPhoto, { name: "Charizard VMAX", rarity: "Gold Secret Rare" });
  assert.equal(v.status, "UNKNOWN");
  assert.equal(v.reason, "genuine_printing_is_metal_or_gold");
});

// --- Stage 2 wiring (vision injected) ----------------------------------

const counterfeitRow = {
  id: 4220,
  card_name: "Pikachu & Zekrom GX (Secret)",
  card_set: "SM - Team Up",
  image_url: "https://i.ebayimg.com/x.jpg",
  market_price: 241,
  discount_pct: 0.63,
};

test("Stage 2 COUNTERFEIT flows through to a COUNTERFEIT_MISMATCH verdict", async () => {
  const v = await screenDeal(
    { row: counterfeitRow, canonicalUrl: "https://tcgplayer-cdn.tcgplayer.com/product/183806_in_1000x1000.jpg" },
    {
      fetchImage: async () => img("counterfeit-pikazek.jpg"),
      vision: async () => ({
        status: VERDICTS.COUNTERFEIT,
        reason: "vision:engraved metal plate, no halftone, (c)2020 on a 2017 set",
      }),
    }
  );
  assert.equal(v.status, "COUNTERFEIT_MISMATCH");
  assert.match(v.reason, /vision:/);
});

test("Stage 2 IDENTITY_MISMATCH flows through to an IDENTITY_MISMATCH verdict (genuine card, wrong print)", async () => {
  const v = await screenDeal(
    { row: counterfeitRow, canonicalUrl: "x" },
    {
      fetchImage: async () => img("counterfeit-pikazek.jpg"),
      vision: async () => ({
        status: VERDICTS.IDENTITY,
        reason: "vision:genuine paper card but set/number differ - different printing",
      }),
    }
  );
  assert.equal(v.status, "IDENTITY_MISMATCH");
  assert.match(v.reason, /vision:/);
});

test("Stage 2 is NOT consulted once Stage 1 already returned MATCH", async () => {
  let visionCalls = 0;
  const v = await screenDeal(
    {
      row: { ...counterfeitRow, card_name: "Umbreon GX (Full Art)", card_set: "SM Base Set" },
      canonicalUrl: "x",
    },
    {
      fetchImage: async (u) =>
        u === "x" ? img("canonical-umbreon-fa.jpg") : img("genuine-umbreon-fa.jpg"),
      vision: async () => {
        visionCalls++;
        return { status: VERDICTS.COUNTERFEIT, reason: "vision:should-not-be-called" };
      },
    }
  );
  assert.equal(v.status, "MATCH");
  assert.equal(visionCalls, 0);
});

test("a bare/legacy vision 'MISMATCH' (no counterfeit evidence) resolves to IDENTITY_MISMATCH, not counterfeit", async () => {
  const v = await screenDeal(
    { row: counterfeitRow, canonicalUrl: "x" },
    {
      fetchImage: async () => img("counterfeit-pikazek.jpg"),
      // simulates visionClassify already having normalised a bare
      // "MISMATCH" answer; the orchestrator must still route it safely
      vision: async () => ({ status: normalizeVisionVerdict("MISMATCH"), reason: "vision:not the same card" }),
    }
  );
  assert.equal(v.status, "IDENTITY_MISMATCH");
});

test("13. a failed image fetch degrades to UNKNOWN, never blocks (ingestion unaffected)", async () => {
  const v = await screenDeal(
    { row: counterfeitRow, canonicalUrl: "x" },
    { fetchImage: async () => { throw new Error("network down"); }, vision: async () => null }
  );
  assert.equal(v.status, "UNKNOWN");
  assert.match(v.reason, /fetch_failed/);
});

// --- display policy ---------------------------------------------------

const deal = (over) => ({
  id: 1,
  is_active: true,
  is_graded: false,
  title: "Pikachu & Zekrom GX 184/181 SM Team Up Secret Rare Holo",
  condition: "Near Mint",
  card_language: "english",
  card_name: "Pikachu & Zekrom GX (Secret)",
  card_set: "SM - Team Up",
  discount_pct: 0.63,
  market_price: 241,
  listing_id: "v1|168631568736|0",
  listing_url: "https://www.ebay.com/itm/168631568736?x=1",
  affiliate_url: "https://www.ebay.com/itm/168631568736?x=1&campid=5339197414",
  listing_type: "FIXED_PRICE",
  auction_end_at: null,
  ...over,
});

test("10a. persisted COUNTERFEIT_MISMATCH -> authenticity:proxy_or_counterfeit, row hidden", () => {
  const r = deal({ visual_authenticity_status: "COUNTERFEIT_MISMATCH", visual_authenticity_reason: "vision:metal plate, no halftone, fake (c)2020" });
  assert.equal(visualAuthenticityReason(r), "authenticity:proxy_or_counterfeit");
  assert.equal(isDisplayableDeal(r), false);
  assert.equal(disqualificationReason(r), "authenticity:proxy_or_counterfeit");
});

test("10b. persisted IDENTITY_MISMATCH -> identity:visual_mismatch, row hidden, NOT called counterfeit", () => {
  const r = deal({ visual_authenticity_status: "IDENTITY_MISMATCH", visual_authenticity_reason: "vision:genuine card, wrong set/number" });
  assert.equal(visualAuthenticityReason(r), "identity:visual_mismatch");
  assert.equal(isDisplayableDeal(r), false);
  assert.equal(disqualificationReason(r), "identity:visual_mismatch");
  assert.notEqual(disqualificationReason(r), "authenticity:proxy_or_counterfeit");
});

test("10c. legacy bare MISMATCH still hides as counterfeit (nothing silently un-hides before the re-screen)", () => {
  const r = deal({ visual_authenticity_status: "MISMATCH", visual_authenticity_reason: "vision:metal plate" });
  assert.equal(visualAuthenticityReason(r), "authenticity:proxy_or_counterfeit");
  assert.equal(isDisplayableDeal(r), false);
});

test("9/11. UNKNOWN is never counterfeit; a Stage-1-only UNKNOWN never hides even an extreme deal", () => {
  const stage1only = deal({
    visual_authenticity_status: "UNKNOWN",
    visual_authenticity_reason: "stage1 stage1_inconclusive ratio=0.4 | vision_unavailable",
    discount_pct: 0.75,
    market_price: 400,
  });
  assert.equal(visualAuthenticityReason(stage1only), null);
  assert.equal(isDisplayableDeal(stage1only), true);
});

test("11. UNKNOWN hides ONLY when vision actually ran AND the deal is high-value + extreme-discount", () => {
  const visionUnknownExtreme = deal({
    visual_authenticity_status: "UNKNOWN",
    visual_authenticity_reason: "vision:could not determine construction | stage1 ...",
    discount_pct: 0.74,
    market_price: 300,
  });
  assert.equal(visualAuthenticityReason(visionUnknownExtreme), "authenticity:visual_unverified");
  assert.equal(isDisplayableDeal(visionUnknownExtreme), false);

  // same vision-UNKNOWN but only a moderate discount -> shown normally
  const visionUnknownModerate = deal({
    visual_authenticity_status: "UNKNOWN",
    visual_authenticity_reason: "vision:could not determine construction",
    discount_pct: 0.4,
  });
  assert.equal(visualAuthenticityReason(visionUnknownModerate), null);
});

test("MATCH / unscreened (null) -> no effect from the visual layer", () => {
  assert.equal(visualAuthenticityReason(deal({ visual_authenticity_status: "MATCH", visual_authenticity_reason: "stage1 colour_consistent" })), null);
  assert.equal(visualAuthenticityReason(deal({})), null); // column absent / unscreened
  assert.equal(isDisplayableDeal(deal({})), true);
});

// --- queue bound ----------------------------------------------------------

test("queue: only valuable raw singles with a risk signal enter screening", () => {
  const base = {
    is_graded: false,
    card_tcgplayer_id: "183806",
    image_url: "https://i.ebayimg.com/x.jpg",
    market_price: 240,
    discount_pct: 0.62,
  };
  assert.equal(isVisualScreeningCandidate(base), true); // steep + valuable
  assert.equal(isVisualScreeningCandidate({ ...base, discount_pct: 0.2 }), false); // not steep, no other flag
  assert.equal(isVisualScreeningCandidate({ ...base, market_price: 20 }), false); // cheap
  assert.equal(isVisualScreeningCandidate({ ...base, is_graded: true }), false); // graded
  assert.equal(isVisualScreeningCandidate({ ...base, card_tcgplayer_id: null }), false); // no canonical ref
  assert.equal(
    isVisualScreeningCandidate({ ...base, discount_pct: 0.3, disqualified_reason: "reference:price_unverified" }),
    true
  ); // price-ref flag alone qualifies
});

// --- regression: the deal-12766 queue-miss (escape class) --------------
//
// Deal 12766 was a $664 raw Charizard GX Rainbow Rare at 54.85% off - a
// gold-metal counterfeit whose title/number/HP/rarity all matched the
// genuine card. It NEVER entered the visual queue: 0.5485 fell 0.15pp
// short of the 0.55 `steep` gate, and its trust-signal columns
// (seller_feedback_score / image_count / returns_accepted) were null
// (row ingested before those columns existed), so the thin-listing path
// was dead too. The fix: a second, tighter gate - a high-value chase
// card ($300+) at a materially-below-market price (40%+ off) - so this
// class is screened without widening the queue to every mid-value
// discount.

const escapeRow = {
  is_graded: false,
  card_tcgplayer_id: "138497",
  image_url: "https://i.ebayimg.com/images/g/uLwAAeSwPGtqUr~w/s-l1600.jpg",
  market_price: 664.47,
  discount_pct: 0.5485,
  // the null trust signals that killed the thin-listing path
  seller_feedback_score: null,
  image_count: null,
  returns_accepted: null,
  disqualified_reason: null,
};

test("regression 12766: high-value raw card just under the steep gate, null trust signals, IS a candidate", () => {
  assert.equal(isVisualScreeningCandidate(escapeRow), true);
});

// --- regression: deal 24195 (sub-$100 chase-card counterfeit) ----------
//
// Deal 24195 was a gold-metal "Custom Cards" novelty of Charizard VMAX
// SWSH261: a real card id, a clean title, market_price $47.35. It NEVER
// entered the visual queue - market_price sat under the $100
// CANDIDATE_MIN_MARKET_USD floor, and its TOTAL discount was only ~16%
// because ~80% of the undercut was moved into a padded "shipping" line
// (item price alone ~$22 USD, ~54% below market). The fix lowers the
// value floor for a tight set of high-counterfeit-risk species and adds
// a pre-shipping item-vs-market gap signal. It is ADDITIVE - it only
// routes more rows to the out-of-band worker and changes no display gate.
// Tests key on the CHARACTERISTIC (risk species + sub-$100 + shipping-
// camouflaged undercut), never on the deal id or the card name.

const deal24195Shape = {
  is_graded: false,
  card_tcgplayer_id: "285378",
  card_name: "Charizard VMAX - SWSH261",
  image_url: "https://i.ebayimg.com/images/g/rLAAAeSwFONqPFLB/s-l1600.jpg",
  market_price: 47.35,
  discount_pct: 0.1616, // tame headline discount ...
  price: 30.58,
  total_price: 55.21, // ... because shipping ($24.63) is most of the total
  total_price_usd: 39.6966,
  disqualified_reason: null,
  seller_feedback_score: null,
  image_count: null,
  returns_accepted: null,
};

test("24195: a risk-species sub-$100 listing with a shipping-camouflaged undercut IS now a screening candidate", () => {
  assert.equal(isHighCounterfeitRiskSpecies(deal24195Shape), true);
  // pre-shipping item price is ~54% below market even though discount_pct is ~16%
  assert.ok(itemPriceVsMarketGap(deal24195Shape) > 0.45);
  assert.equal(isVisualScreeningCandidate(deal24195Shape), true);
});

test("24195: old $100 floor + tame headline discount would have rejected it (this is the escape being closed)", () => {
  // no risk-species name -> the ordinary $100 floor applies -> rejected
  assert.equal(
    isVisualScreeningCandidate({ ...deal24195Shape, card_name: "Corviknight VMAX - SWSH123" }),
    false
  );
});

test("24195: still bounded - a NON-risk species below $100 is never screened however it is discounted", () => {
  const generic = { ...deal24195Shape, card_name: "Wobbuffet - SV05 123/162" };
  assert.equal(isVisualScreeningCandidate({ ...generic, discount_pct: 0.7 }), false);
  assert.equal(isVisualScreeningCandidate({ ...generic, discount_pct: 0.9, price: 5, total_price: 50, total_price_usd: 50 }), false);
});

test("24195: a risk-species card at/above $100 is unchanged - the ordinary gates already covered it", () => {
  const hiVal = { ...deal24195Shape, market_price: 250, discount_pct: 0.2, price: 200, total_price: 220, total_price_usd: 220 };
  // 20% off, $250: below every ordinary trigger, and the risk-species
  // path only extends BELOW CANDIDATE_MIN_MARKET_USD
  assert.equal(isVisualScreeningCandidate(hiVal), false);
  assert.ok(RISK_SPECIES_MIN_MARKET_USD < CANDIDATE_MIN_MARKET_USD);
});

test("24195: a plainly-discounted risk-species card in the $25-100 band is screened; a barely-discounted one with honest shipping is not", () => {
  const base = { ...deal24195Shape, discount_pct: undefined };
  // 45% off, no shipping trick -> discount arm
  assert.equal(
    isVisualScreeningCandidate({ ...base, discount_pct: 0.45, price: 26, total_price: 26, total_price_usd: 26, market_price: 47.35 }),
    true
  );
  // 12% off, item gap ~= headline discount (no camouflage) -> not screened
  assert.equal(
    isVisualScreeningCandidate({ ...base, discount_pct: 0.12, price: 41, total_price: 42, total_price_usd: 42, market_price: 47.35 }),
    false
  );
});

test("24195: isVisualScreeningCandidate stays a pure sync predicate with the new signal", () => {
  const started = Date.now();
  const out = isVisualScreeningCandidate(deal24195Shape);
  assert.equal(typeof out, "boolean");
  assert.ok(Date.now() - started < 50);
});

test("regression 12766 + 12750: the screening queue is a bounded widening, not 'screen every expensive card'", () => {
  // exported constants are sane and each widening sits BELOW the general
  // steep gate but not unbounded. The premium band (mkt>=100 & disc>=40%)
  // is the widest - it must cover every deal the premium gate blocks so
  // an unscreened high-risk deal can still earn a Top 10 slot after MATCH.
  assert.equal(CANDIDATE_HIGH_VALUE_USD, 300);
  assert.equal(CANDIDATE_HIGH_VALUE_DISCOUNT, 0.4);
  assert.ok(CANDIDATE_HIGH_VALUE_DISCOUNT < CANDIDATE_MIN_DISCOUNT);

  const hv = { ...escapeRow, seller_feedback_score: null };
  // a genuine expensive card at a NORMAL discount is still not screened
  assert.equal(isVisualScreeningCandidate({ ...hv, discount_pct: 0.2 }), false);
  assert.equal(isVisualScreeningCandidate({ ...hv, discount_pct: 0.39 }), false);
  // exactly at the 40% threshold, $100+ -> screened (premium band)
  assert.equal(isVisualScreeningCandidate({ ...hv, discount_pct: 0.4 }), true);
  assert.equal(isVisualScreeningCandidate({ ...hv, market_price: 120, discount_pct: 0.5485 }), true);
  assert.equal(isVisualScreeningCandidate({ ...hv, market_price: 250, discount_pct: 0.5 }), true);
  // still bounded by the $100 market floor: a sub-$100 card is never
  // screened, no matter how steep the discount
  assert.equal(isVisualScreeningCandidate({ ...hv, market_price: 90, discount_pct: 0.5 }), false);
  assert.equal(isVisualScreeningCandidate({ ...hv, market_price: 90, discount_pct: 0.7 }), false);
  // and a $100+ card short of BOTH the 40% premium floor and the 55%
  // steep gate is still not screened
  assert.equal(isVisualScreeningCandidate({ ...hv, market_price: 250, discount_pct: 0.35 }), false);
  // no card at all -> can't screen (no canonical reference)
  assert.equal(isVisualScreeningCandidate({ ...hv, card_tcgplayer_id: null, discount_pct: 0.6 }), false);
});

test("regression 12766: entering the queue via the high-value gate does NOT auto-label - a Stage-1-only UNKNOWN at 40-55% off stays visible", () => {
  // this is the false-positive guard for the ~50 legit steep vintage
  // deals that now also enter the queue: screening them can only ever
  // hide one if vision RAN and it is >=70% off. A 12766-band deal
  // (40-55% off) with a cheap Stage-1-only UNKNOWN must render normally.
  const r = deal({
    visual_authenticity_status: "UNKNOWN",
    visual_authenticity_reason: "stage1 stage1_inconclusive ratio=0.5 | vision_unavailable",
    market_price: 664,
    discount_pct: 0.5485,
  });
  assert.equal(visualAuthenticityReason(r), null);
  assert.equal(isDisplayableDeal(r), true);
});

test("regression 12766: a genuine GOLD / metal official printing entering via the high-value gate is still never auto-faked by Stage 1", () => {
  // Stage 1 must stay UNKNOWN (not MATCH, not MISMATCH) for a real
  // gold/metal printing even though the row is now a queue candidate.
  const goldCandidate = { ...escapeRow, discount_pct: 0.45 };
  assert.equal(isVisualScreeningCandidate(goldCandidate), true);
  const vivid = { colorfulness: 70, meanSaturation: 0.3, meanValue: 0.6, grayFraction: 0.2, metallicHueFraction: 0.1 };
  const goldPhoto = { colorfulness: 14, meanSaturation: 0.1, meanValue: 0.7, grayFraction: 0.82, metallicHueFraction: 0.7 };
  const v = classifyStage1(vivid, goldPhoto, { name: "Charizard VMAX", rarity: "Gold Secret Rare" });
  assert.equal(v.status, "UNKNOWN");
  assert.equal(v.reason, "genuine_printing_is_metal_or_gold");
});

test("regression 12766: isVisualScreeningCandidate stays a pure sync predicate (scanner independence)", () => {
  // no await, no image decode, no network - safe to call from the
  // display path and from a bounded offline worker alike.
  const started = Date.now();
  const out = isVisualScreeningCandidate(escapeRow);
  assert.equal(typeof out, "boolean");
  assert.ok(Date.now() - started < 50);
});

test("13. the display gate does no image work - visualAuthenticityReason is a pure field read", () => {
  // no throw, synchronous, on a bare object with no image / no sharp
  assert.equal(
    visualAuthenticityReason({ visual_authenticity_status: "COUNTERFEIT_MISMATCH", visual_authenticity_reason: "vision:x" }),
    "authenticity:proxy_or_counterfeit"
  );
  assert.equal(
    visualAuthenticityReason({ visual_authenticity_status: "IDENTITY_MISMATCH", visual_authenticity_reason: "vision:x" }),
    "identity:visual_mismatch"
  );
});

// --- verdict taxonomy: counterfeit vs identity vs uncertain -----------
//
// The hardening that followed the 12766 / widened-queue work. Two failure
// modes it fixes:
//   (1) genuine textured/embossed/holo foils being called COUNTERFEIT
//       (Umbreon delta 17/113 -> deals 25493/25563; Dialga EX 122/119 SR
//       -> deal 12807). Vision read legitimate foil texture as an
//       engraved metal plate.
//   (2) MISMATCH conflating a physical fake with a genuine card matched
//       to the WRONG printing (Lugia 29/115 -> matched to Lugia ex;
//       Articuno 036/195 -> matched to Supreme Victors 148/147; deal
//       30835 -> seller's set metadata wrong, photo shows a cheaper
//       Ascended Heroes ex than the matched printing).

test("taxonomy: normalizeVisionVerdict maps the model's answers onto the 4 verdicts", () => {
  assert.equal(normalizeVisionVerdict("MATCH"), "MATCH");
  assert.equal(normalizeVisionVerdict("UNKNOWN"), "UNKNOWN");
  assert.equal(normalizeVisionVerdict("COUNTERFEIT"), "COUNTERFEIT_MISMATCH");
  assert.equal(normalizeVisionVerdict("COUNTERFEIT_MISMATCH"), "COUNTERFEIT_MISMATCH");
  assert.equal(normalizeVisionVerdict("IDENTITY_MISMATCH"), "IDENTITY_MISMATCH");
  // a bare "not the same" answer is the LESS accusatory verdict, never counterfeit
  assert.equal(normalizeVisionVerdict("MISMATCH"), "IDENTITY_MISMATCH");
  assert.equal(normalizeVisionVerdict("WRONG_PRINTING"), "IDENTITY_MISMATCH");
  assert.equal(normalizeVisionVerdict("banana"), null);
});

test("taxonomy: the vision prompt keeps the counterfeit guardrails", () => {
  const p = visionPrompt({ name: "Umbreon", set: "EX Delta Species" });
  // it must offer all four verdicts
  for (const v of ["MATCH", "COUNTERFEIT", "IDENTITY_MISMATCH", "UNKNOWN"]) assert.ok(p.includes(v), v);
  // counterfeit needs a COMBINATION, not one signal
  assert.match(p, /COMBINATION/i);
  // the non-evidence list: none of these ALONE = counterfeit
  for (const term of ["holo", "foil sheen", "embossed genuine foil", "sleeve glare", "angled light", "rounded corners", "perspective"]) {
    assert.ok(p.toLowerCase().includes(term.toLowerCase()), `prompt must name "${term}" as non-evidence`);
  }
  // wrong card but real paper -> identity, not counterfeit
  assert.match(p, /IDENTITY_MISMATCH, not COUNTERFEIT/);
});

test("taxonomy: 12766 & 4582 (metal-plate repros) -> COUNTERFEIT_MISMATCH -> hidden as counterfeit", () => {
  for (const id of [12766, 4582]) {
    const r = deal({
      id,
      visual_authenticity_status: "COUNTERFEIT_MISMATCH",
      visual_authenticity_reason: "vision:solid metal plate, embossed relief text, no halftone dots, fabricated copyright",
    });
    assert.equal(visualAuthenticityReason(r), "authenticity:proxy_or_counterfeit");
    assert.equal(isDisplayableDeal(r), false);
  }
});

test("taxonomy: genuine Umbreon-delta foil & Dialga-EX secret-rare foil -> MATCH/UNKNOWN, never counterfeit", () => {
  // a MATCH verdict carries no penalty
  const umbreon = deal({
    visual_authenticity_status: "MATCH",
    visual_authenticity_reason: "vision:same card; ring colour shift is holo sheen under angled light",
  });
  assert.equal(visualAuthenticityReason(umbreon), null);
  assert.equal(isDisplayableDeal(umbreon), true);

  // a vision-UNKNOWN below the extreme-discount band stays visible
  const dialga = deal({
    market_price: 987, discount_pct: 0.44,
    visual_authenticity_status: "UNKNOWN",
    visual_authenticity_reason: "vision:embossed full-bleed foil is normal for a 122/119 secret rare; cannot confirm print structure",
  });
  assert.equal(visualAuthenticityReason(dialga), null);
  assert.equal(isDisplayableDeal(dialga), true);
});

test("taxonomy: wrong-print matches (Lugia 29/115, Articuno 036/195, deal 30835) -> identity:visual_mismatch -> hidden, not counterfeit", () => {
  const reasons = [
    "vision:genuine paper Lugia 29/115, but matched printing is Lugia ex 105/115",
    "vision:genuine Silver Tempest Articuno 036/195, not the Supreme Victors 148/147 secret rare",
    "vision:deal 30835 - genuine paper card but a cheaper regular ex printing than the matched card; seller set metadata wrong",
  ];
  for (const reason of reasons) {
    const r = deal({
      discount_pct: 0.5,
      market_price: 400,
      visual_authenticity_status: "IDENTITY_MISMATCH",
      visual_authenticity_reason: reason,
    });
    assert.equal(visualAuthenticityReason(r), "identity:visual_mismatch");
    assert.equal(disqualificationReason(r), "identity:visual_mismatch");
    assert.notEqual(visualAuthenticityReason(r), "authenticity:proxy_or_counterfeit");
    assert.equal(isDisplayableDeal(r), false);
  }
});

test("taxonomy: UNKNOWN safety is unchanged - Stage-1-only UNKNOWN never hides, vision-UNKNOWN hides only high-value+extreme", () => {
  const stage1only = deal({
    visual_authenticity_status: "UNKNOWN",
    visual_authenticity_reason: "stage1 stage1_inconclusive ratio=0.5 | vision_unavailable",
    market_price: 500, discount_pct: 0.8,
  });
  assert.equal(visualAuthenticityReason(stage1only), null);

  const visionExtreme = deal({
    visual_authenticity_status: "UNKNOWN",
    visual_authenticity_reason: "vision:cannot establish construction | stage1 ...",
    market_price: 500, discount_pct: 0.8,
  });
  assert.equal(visualAuthenticityReason(visionExtreme), "authenticity:visual_unverified");
});
