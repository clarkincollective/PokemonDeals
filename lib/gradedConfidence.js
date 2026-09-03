// Phase 12B - graded-price integrity.
//
// PokemonPriceTracker's per-grade eBay sold buckets are keyed on card
// NAME + COLLECTOR NUMBER, with no printing/edition/language field. A
// 179-card / 1,823-tier production audit found: 79% of tiers
// provider-flagged low-confidence, median 2 sales/tier, 39% single-sale,
// 44% priced BELOW raw NM (incl. 109 PSA/BGS/CGC 9-10 tiers, which is
// impossible for the same printing), and order-of-magnitude blends on
// shared-identity cards (Fossil Shellder "PSA 10 $152" on 39 sales for a
// ~$1 raw card).
//
// So a provider graded number is NOT public-display quality by default.
// This helper decides, deterministically and server-side, whether the
// evidence for one exact card / grader / grade is coherent enough to
// show. It NEVER fabricates, interpolates, forces a ladder, or invents a
// replacement value - it only decides show / show-with-a-note / suppress.

// The 11 WOTC dual-printing sets - kept in sync with
// WOTC_DUAL_PRINTING_SETS in lib/pokemonPriceTracker.js (inlined here to
// avoid a circular require: pokemonPriceTracker imports this module).
const WOTC_DUAL_PRINTING_SETS = [
  "Base Set",
  "Base Set (Shadowless)",
  "Jungle",
  "Fossil",
  "Team Rocket",
  "Gym Heroes",
  "Gym Challenge",
  "Neo Genesis",
  "Neo Discovery",
  "Neo Revelation",
  "Neo Destiny",
];

// Established graders with liquid slab markets. ACE / TAG / other niche
// grader buckets the provider returns are too thin to classify and are
// suppressed.
const RECOGNIZED_GRADERS = new Set(["psa", "bgs", "cgc", "sgc"]);

// Sets whose (name, collector-number) pair is REUSED by another printing,
// so the provider's name+number bucket blends printings worth wildly
// different amounts. Superset of the WOTC dual-printing sets (Phase 11B).
const SHARED_IDENTITY_SETS = new Set([
  ...WOTC_DUAL_PRINTING_SETS,
  "Base Set 2",
  "Legendary Collection",
  "Celebrations",
  "Celebrations: Classic Collection",
  "XY - Evolutions",
]);

// Set / name patterns that indicate a reused (name, number) identity -
// the WOTC-era sets (matched by pattern so `setName` variants like
// "Base Set (Unlimited)" / "Base Set 1st Edition" / "Pokemon Jungle"
// still catch), plus the modern reprint packs, promo re-releases,
// prerelease / staff variants, and jumbos. Deliberately broad: this
// phase fails closed on printing ambiguity (correct short data beats
// wrong rich data), so also catching e.g. "EX Team Rocket Returns"
// (which reprints WOTC Team Rocket cards) is intended, not a bug.
const SHARED_IDENTITY_RE =
  /base set|shadowless|\bjungle\b|\bfossil\b|team rocket|gym (?:heroes|challenge)|neo (?:genesis|discovery|revelation|destiny)|legendary collection|celebration|classic collection|xy - evolutions|first partner|prize pack|trick or trade|\bjumbo\b|deck exclusive|prerelease|\bstaff\b|world championship|\bwinner\b/i;

function isSharedGradedIdentity(setName, cardName) {
  const s = String(setName ?? "");
  if (SHARED_IDENTITY_SETS.has(s)) return true;
  return SHARED_IDENTITY_RE.test(s) || SHARED_IDENTITY_RE.test(String(cardName ?? ""));
}

const GRADED_CONFIDENCE = {
  minSales: 3, // fewer real sales than this -> can't stand behind a price
  highSales: 8, // at/above this + everything else clean -> "high"; between -> "limited"
  maxStaleDays: 365, // last sale older than this -> suppress
  spreadCeiling: 8, // this grade's own low->high spread; one grade of one card can't span more
  extremeVsRaw: 40, // price > this x raw NM, on a small sample, with no sibling tier near it -> suppress
  smallSample: 5, // "small sample" for the extreme-outlier rule
  siblingWithin: 3, // a sibling tier within this ratio corroborates an extreme price
};

const GRADE_9_10 = /(?:9|9_5|10)$/; // a 9 / 9.5 / 10 slab is never worth less than raw NM of the same printing

function graderOf(key) {
  return String(key ?? "").match(/^[a-z]+/)?.[0] ?? "";
}

// tier: { key, currentPrice, minPrice, maxPrice, saleCount, lastSaleDate, providerLowConfidence }
// ctx:  { rawNm, setName, cardName, siblingPrices:number[] } (siblingPrices = the OTHER tiers' currentPrice)
function gradedTierConfidence(tier, ctx = {}, cfg = GRADED_CONFIDENCE) {
  const reasons = [];
  const price = Number(tier?.currentPrice);
  const rawNm = Number(ctx.rawNm);
  const count = Number(tier?.saleCount) || 0;

  if (!(price > 0)) reasons.push("no-price");
  if (!RECOGNIZED_GRADERS.has(graderOf(tier?.key))) reasons.push("unrecognized-grader");
  if (isSharedGradedIdentity(ctx.setName, ctx.cardName)) reasons.push("printing-identity-unresolvable");
  if (count < cfg.minSales) reasons.push("insufficient-sales");
  if (tier?.providerLowConfidence) reasons.push("provider-low-confidence");

  const ageDays = tier?.lastSaleDate
    ? (Date.now() - Date.parse(tier.lastSaleDate)) / 86_400_000
    : Infinity;
  if (ageDays > cfg.maxStaleDays) reasons.push("stale");

  const lo = Number(tier?.minPrice);
  const hi = Number(tier?.maxPrice);
  if (lo > 0 && hi > 0 && hi / lo > cfg.spreadCeiling) reasons.push("wide-internal-spread");

  // A 9 / 9.5 / 10 tier below raw NM = raw sales (or the wrong card) in the slab bucket.
  if (rawNm > 0 && price > 0 && GRADE_9_10.test(String(tier?.key)) && price < rawNm) {
    reasons.push("grade-9-10-below-raw");
  }

  // Extreme vs raw on a thin sample, with no adjacent tier anywhere near it.
  if (rawNm > 0 && price > 0 && price / rawNm > cfg.extremeVsRaw && count <= cfg.smallSample) {
    const corroborated = (ctx.siblingPrices ?? []).some(
      (p) => p > 0 && Math.max(price / p, p / price) <= cfg.siblingWithin
    );
    if (!corroborated) reasons.push("extreme-uncorroborated-outlier");
  }

  if (reasons.length > 0) return { level: "low", reasons };
  return { level: count >= cfg.highSales ? "high" : "limited", reasons: count < cfg.highSales ? ["small-but-real-sample"] : [] };
}

module.exports = {
  RECOGNIZED_GRADERS,
  SHARED_IDENTITY_SETS,
  GRADED_CONFIDENCE,
  isSharedGradedIdentity,
  graderOf,
  gradedTierConfidence,
};
