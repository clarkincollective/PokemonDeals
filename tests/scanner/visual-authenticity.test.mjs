// Bounded visual counterfeit screening (lib/visualAuthenticity) + its
// wiring into the display gate. Two-stage design:
//   Stage 1 (sharp colour/hash) - MATCH or UNKNOWN only, never MISMATCH.
//   Stage 2 (vision, env-gated)  - MATCH / MISMATCH / UNKNOWN.
// MISMATCH -> authenticity:proxy_or_counterfeit.
// UNKNOWN, only when vision actually ran AND high-value + extreme-discount
//   -> authenticity:visual_unverified. A Stage-1-only UNKNOWN never hides.

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
  CANDIDATE_MIN_DISCOUNT,
  CANDIDATE_HIGH_VALUE_USD,
  CANDIDATE_HIGH_VALUE_DISCOUNT,
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
    assert.notEqual(v.status, "MATCH", `${name}: must not be cleared`);
    assert.notEqual(v.status, "MISMATCH", `${name}: Stage 1 never MISMATCHes`);
    assert.equal(v.status, "UNKNOWN");
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

test("Stage 1: a GENUINE card in a sleeve / off-angle is UNKNOWN, never MISMATCH", async () => {
  const v = classifyStage1(
    await imageColorStats(img("canonical-tapulele.jpg")),
    await imageColorStats(img("genuine-tapulele-sleeved.jpg")),
    { name: "Tapu Lele GX (Secret)", set: "SM - Guardians Rising" }
  );
  assert.ok(["MATCH", "UNKNOWN"].includes(v.status));
  assert.notEqual(v.status, "MISMATCH");
});

// --- Stage 1: pure logic -------------------------------------------------

test("Stage 1 never MISMATCHes on synthetic 'metal sheet' stats (that verdict is Stage 2 only)", () => {
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

test("1-3. Stage 2 vision MISMATCH flows through to a MISMATCH verdict", async () => {
  const v = await screenDeal(
    { row: counterfeitRow, canonicalUrl: "https://tcgplayer-cdn.tcgplayer.com/product/183806_in_1000x1000.jpg" },
    {
      fetchImage: async () => img("counterfeit-pikazek.jpg"),
      vision: async () => ({ status: "MISMATCH", reason: "vision:engraved metal plate, real card is paper Full Art" }),
    }
  );
  assert.equal(v.status, "MISMATCH");
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
        return { status: "MISMATCH", reason: "vision:should-not-be-called" };
      },
    }
  );
  assert.equal(v.status, "MATCH");
  assert.equal(visionCalls, 0);
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

test("10. persisted MISMATCH -> authenticity:proxy_or_counterfeit, row hidden", () => {
  const r = deal({ visual_authenticity_status: "MISMATCH", visual_authenticity_reason: "vision:metal plate" });
  assert.equal(visualAuthenticityReason(r), "authenticity:proxy_or_counterfeit");
  assert.equal(isDisplayableDeal(r), false);
  assert.equal(disqualificationReason(r), "authenticity:proxy_or_counterfeit");
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

test("regression 12766: the high-value gate is a bounded widening, not 'screen every expensive card'", () => {
  // exported constants are sane and the new gate genuinely sits BELOW the
  // general steep gate (widens) but not by an unbounded amount.
  assert.equal(CANDIDATE_HIGH_VALUE_USD, 300);
  assert.equal(CANDIDATE_HIGH_VALUE_DISCOUNT, 0.4);
  assert.ok(CANDIDATE_HIGH_VALUE_DISCOUNT < CANDIDATE_MIN_DISCOUNT);

  const hv = { ...escapeRow, seller_feedback_score: null };
  // a genuine expensive card at a NORMAL discount is still not screened
  assert.equal(isVisualScreeningCandidate({ ...hv, discount_pct: 0.2 }), false);
  assert.equal(isVisualScreeningCandidate({ ...hv, discount_pct: 0.39 }), false);
  // boundary: exactly at the threshold qualifies
  assert.equal(isVisualScreeningCandidate({ ...hv, discount_pct: 0.4 }), true);
  // a cheap card at the SAME 54.85% as 12766 is NOT pulled in by the
  // high-value path (and 0.5485 < 0.55 so `steep` misses it too)
  assert.equal(isVisualScreeningCandidate({ ...hv, market_price: 120, discount_pct: 0.5485 }), false);
  // ...but a cheap card genuinely past the steep gate still screens, as before
  assert.equal(isVisualScreeningCandidate({ ...hv, market_price: 120, discount_pct: 0.6 }), true);
  // just below the value floor, just under steep -> not screened
  assert.equal(isVisualScreeningCandidate({ ...hv, market_price: 250, discount_pct: 0.5 }), false);
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
  const r = visualAuthenticityReason({ visual_authenticity_status: "MISMATCH", visual_authenticity_reason: "vision:x" });
  assert.equal(r, "authenticity:proxy_or_counterfeit");
});
