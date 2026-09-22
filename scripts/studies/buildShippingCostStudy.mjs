#!/usr/bin/env node
// SHIPPING-COST STUDY - step 2 of 2: COMPUTE, OFFLINE.
//
//   node scripts/studies/buildShippingCostStudy.mjs <manifest.json> \
//     > lib/studies/shippingCost202609.js
//
// Reads the frozen snapshot named by the manifest and NOTHING ELSE. There
// is no database client in this file and no network call of any kind, so
// re-running it on the same snapshot must produce a byte-identical
// artifact. That is the property that makes the published figures
// reproducible; freezing the aggregates alone never did.
//
// The manifest's SHA-256 digest is re-checked against the rows file
// before anything is computed, and the run aborts if it does not match.
//
// POPULATION, fixed before any figure is calculated:
//   * retained `deals` rows active at the snapshot cutoff;
//   * FIXED_PRICE only - an auction's figure is a current bid, not a
//     price, so including them would mix two different things;
//   * deduplicated by listing key, so one listing counts once;
//   * shipping state "confirmed" only (lib/offerPresentation), i.e. a
//     POSITIVE charge was recorded. UNKNOWN AND UNCONFIRMED SHIPPING ARE
//     EXCLUDED, NOT TREATED AS ZERO - assuming zero would manufacture the
//     finding. Note what this makes the population: every usable row
//     CHARGES for shipping, so the figures describe listings that charge;
//   * item price > 0 and delivered total > 0.
//
// COMPARABLE GROUPS. Two listings are comparable only when every field
// below matches, and some of these had to be added explicitly because a
// single identifier does NOT settle them:
//
//   * PHYSICAL PRINTING - resolved per listing by
//     lib/studies/printingIdentity, which applies lib/printingMatch's own
//     rules. This is the correction at the centre of revision 3. The
//     product id does NOT fix the finish: product 84571 carried nine
//     retained listings at one observation, one titled "Non Holo", one
//     "Reverse Holo" and the rest "Holo". Listings whose printing cannot
//     be evidenced are EXCLUDED from this stage rather than defaulted
//     into a group.
//   * card product id - fixes the catalogue record, and with it the card
//     and (our catalogue being single-language) the language. The listing
//     language is carried in the key anyway so the property is enforced
//     rather than assumed.
//   * condition, is_graded, grader, grade - a raw Near Mint copy and a
//     slabbed PSA 10 are not the same offer.
//   * marketplace - which also fixes the currency, so no group compares
//     two currencies.
//   * recorded delivery basis (domestic / cross-border). A coarse proxy:
//     we record where the item is, NOT a normalised destination, so a
//     group is "consistent recorded basis", never "identical delivery".
//
// TIES. Sorting and taking the first element makes an arbitrary choice
// among listings tied for the lowest item price, and that choice can
// manufacture a ranking reversal. A reversal is counted only when NO
// listing tied for the lowest item price also achieves the lowest
// delivered total.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { shippingState } = require_("../../lib/offerPresentation.js");
const { RESOLUTION } = await import("../../lib/studies/printingIdentity.js");
const { formGroups, countReversals } = await import("../../lib/studies/shippingComparison.js");

const manifestPath = process.argv[2];
if (!manifestPath) {
  process.stderr.write("usage: buildShippingCostStudy.mjs <manifest.json>\n");
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const body = readFileSync(manifest.rowsFile, "utf8");
const digest = createHash("sha256").update(body).digest("hex");
if (digest !== manifest.inputDigest) {
  process.stderr.write(`input digest mismatch\n  manifest: ${manifest.inputDigest}\n  rows:     ${digest}\n`);
  process.exit(1);
}
const input = body.split("\n").filter(Boolean).map((l) => JSON.parse(l));
if (input.length !== manifest.inputCount) {
  process.stderr.write(`input count mismatch: manifest ${manifest.inputCount}, rows ${input.length}\n`);
  process.exit(1);
}

const CURRENCY = { EBAY_US: "USD", EBAY_GB: "GBP", EBAY_DE: "EUR", EBAY_CA: "CAD", EBAY_AU: "AUD", EBAY_IT: "EUR" };
const MIN_N = 20;

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const active = input.length;
const fixedPrice = input.filter((r) => r.type === "FIXED_PRICE");
const seen = new Set();
const deduped = [];
for (const r of fixedPrice) {
  if (seen.has(r.k)) continue;
  seen.add(r.k);
  deduped.push(r);
}
const byState = {};
for (const r of deduped) {
  const s = shippingState({ shipping: r.s });
  byState[s] = (byState[s] ?? 0) + 1;
}
const usable = deduped.filter((r) => shippingState({ shipping: r.s }) === "confirmed" && r.p > 0 && r.t > 0);

const marketplaces = [];
for (const [mkt, currency] of Object.entries(CURRENCY)) {
  const g = usable.filter((r) => r.mk === mkt);
  if (!g.length) continue;
  const pct = g.map((r) => (r.s / r.p) * 100);
  marketplaces.push({
    marketplace: mkt,
    label: mkt.replace("EBAY_", ""),
    currency,
    n: g.length,
    medianItem: Number(median(g.map((r) => r.p)).toFixed(2)),
    medianShipping: Number(median(g.map((r) => r.s)).toFixed(2)),
    medianShippingPctOfItem: Number(median(pct).toFixed(1)),
    shareAtLeast20Pct: Number(((100 * pct.filter((p) => p >= 20).length) / g.length).toFixed(0)),
    characterised: g.length >= MIN_N,
  });
}
marketplaces.sort((a, b) => b.n - a.n);

// --- printing resolution, then grouping ---------------------------------
// Both steps live in lib/studies/* as pure functions, so the behavioural
// tests exercise the same code this generator runs.
const shaped = usable.map((r) => ({
  key: r.k,
  cardId: r.cid ?? "",
  title: r.title ?? "",
  condition: r.cond ?? "",
  catalogPrinting: r.cp ?? null,
  language: r.lang ?? "",
  marketplace: r.mk,
  graded: r.graded,
  grader: r.grader,
  grade: r.grade,
  local: r.local,
  price: r.p,
  total: r.t,
}));
const formed = formGroups(shaped);
const printing = formed.printing;
const byResolution = {};
for (const r of shaped) {
  const res = printing.get(r.key).resolution;
  byResolution[res] = (byResolution[res] ?? 0) + 1;
}
const droppedNoIdentity = formed.droppedForMissingIdentity;
const droppedUnresolvedPrinting = formed.droppedForUnresolvedPrinting;
const comparable = formed.comparable;
const { rankFlips, groupsWithItemPriceTie, tiesNotCountedAsReversals } = countReversals(comparable);

const study = {
  generatedAt: manifest.observationCutoff,
  observationCutoff: manifest.observationCutoff,
  // Revision 3 (2026-09-22): inputs frozen BEFORE calculation and the
  // study computed offline from them; physical printing resolved per
  // listing instead of assumed from the product id.
  methodRevision: 3,
  reproducibility: {
    inputsFrozenBeforeCalculation: true,
    inputCount: manifest.inputCount,
    inputDigest: manifest.inputDigest,
    digestAlgorithm: manifest.digestAlgorithm,
    computedOffline: true,
  },
  minimumNForCharacterisation: MIN_N,
  population: {
    activeRows: active,
    fixedPrice: fixedPrice.length,
    afterDeduplication: deduped.length,
    byShippingState: byState,
    usable: usable.length,
    // Two DIFFERENT ratios, both stated, because conflating them is how
    // the first published version of this page got its arithmetic wrong.
    excludedNotConfirmed: deduped.length - usable.length,
    excludedShareOfDeduplicatedPct: deduped.length
      ? Number(((100 * (deduped.length - usable.length)) / deduped.length).toFixed(1))
      : null,
    sampleGrowthIfIncludedPct: usable.length
      ? Number(((100 * (deduped.length - usable.length)) / usable.length).toFixed(1))
      : null,
  },
  marketplaces,
  printingIdentity: {
    byResolution,
    resolvedListings: formed.eligible.length,
    unresolvedListings: droppedUnresolvedPrinting,
    unresolvedSharePct: usable.length ? Number(((100 * droppedUnresolvedPrinting) / usable.length).toFixed(1)) : null,
    productIdsCoveringMultipleFinishes: new Set(
      shaped.filter((r) => printing.get(r.key).resolution === RESOLUTION.UNRESOLVED_ID_COVERS_MULTIPLE_FINISHES).map((r) => r.cardId)
    ).size,
  },
  comparableGroups: {
    eligibleRows: formed.eligible.length,
    droppedForMissingIdentity: droppedNoIdentity,
    droppedForUnresolvedPrinting: droppedUnresolvedPrinting,
    groups: comparable.length,
    rankFlips,
    rankFlipPct: comparable.length ? Number(((100 * rankFlips) / comparable.length).toFixed(0)) : null,
    groupsWithItemPriceTie,
    tiesNotCountedAsReversals,
    identityFields: [
      "card_tcgplayer_id",
      "printing_family",
      "card_language",
      "marketplace",
      "condition",
      "is_graded",
      "grader",
      "grade",
      "is_local",
    ],
  },
};

process.stdout.write(
  "// GENERATED - do not edit by hand.\n" +
    "// Source: scripts/studies/buildShippingCostStudy.mjs, computed OFFLINE\n" +
    "// from the frozen snapshot named in `reproducibility` below. Re-running\n" +
    "// step 2 against that snapshot reproduces this file byte for byte; the\n" +
    "// snapshot itself is private project evidence and is not published.\n" +
    `export const STUDY = ${JSON.stringify(study, null, 2)};\n`
);
