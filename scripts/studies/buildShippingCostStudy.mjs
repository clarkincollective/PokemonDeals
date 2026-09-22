#!/usr/bin/env node
// SHIPPING-COST STUDY - generator. READ-ONLY against retained records.
//
//   node scripts/studies/buildShippingCostStudy.mjs > lib/studies/shippingCost202609.js
//
// Produces the FROZEN artifact the study page renders. Nothing on the
// published route reads the database, so the figures cannot drift from
// the analysis they were computed from - the same contract the 30-day
// reference-price study uses.
//
// POPULATION, fixed before any figure was calculated:
//   * retained `deals` rows, is_active = true, read at the cutoff below;
//   * FIXED_PRICE only - an auction's figure is a current bid, not a
//     price, so including them would mix two different things;
//   * deduplicated by listing_id, so one listing counts once however
//     many rows reference it;
//   * shipping state "confirmed" only (lib/offerPresentation), i.e. a
//     POSITIVE charge was actually recorded. UNKNOWN AND UNCONFIRMED
//     SHIPPING ARE EXCLUDED, NOT TREATED AS ZERO - that is the whole
//     point of the study and assuming zero would manufacture the
//     finding. Note what this makes the population: shippingState()
//     returns "confirmed" only for shipping > 0, so every usable row
//     CHARGES for shipping. The figures describe listings that charge,
//     not listings in general, and the page says so;
//   * item price > 0 and delivered total > 0.
//
// COMPARABLE GROUPS - what "genuinely comparable" is made to mean.
// Two listings are in the same group only when every field below
// matches. Some of these are guaranteed by one identifier and some are
// not, and the difference matters:
//
//   * card_tcgplayer_id - a canonical per-record catalogue identifier.
//     Distinct printings of one collector number hold DISTINCT ids
//     (Prismatic Umbreon 059/131 base / Poke Ball / Master Ball are
//     three ids), and card_catalog holds one language per id, so exact
//     card AND printing AND language are already settled by this field
//     alone. card_language is still carried in the key so the property
//     is enforced rather than assumed.
//   * marketplace - which also fixes the currency, so no group ever
//     compares amounts in two currencies.
//   * condition, is_graded, grader, grade - a raw Near Mint copy and a
//     slabbed PSA 10 of the same card are not the same offer. The
//     earlier version of this study keyed on condition alone, which
//     could place a graded and a raw listing in one group.
//   * is_local - the recorded delivery basis. A domestic offer and a
//     cross-border offer on the same marketplace are not a like-for-like
//     delivered comparison. This is a coarse proxy: we record where the
//     item is, not a normalised destination, so the group is "consistent
//     recorded basis", not "identical delivery".
//
// Rows with no card identifier or no recorded condition cannot be shown
// to be comparable to anything and are excluded from the group stage
// (they remain in the marketplace figures, which need no pairing).
//
// TIES. Sorting and taking the first element makes an arbitrary choice
// among listings that tie for the lowest item price, and that arbitrary
// choice can manufacture a ranking reversal. A reversal is counted only
// when NO listing tied for the lowest item price also achieves the
// lowest delivered total - i.e. when buying on item price cannot get you
// the cheapest delivered total however the tie is broken.
//
// WHAT THIS IS NOT. These are LISTINGS retained at one moment, not
// completed sales, and not a sample of the market. Marketplaces are
// reported separately in their own currency and never pooled: adding a
// GBP figure to an AUD figure would be arithmetic on incompatible units.
// Delivery destination is whatever each listing offered; we do not
// normalise to one destination and do not claim worldwide coverage.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const req = createRequire(import.meta.url);
const { shippingState } = req("../../lib/offerPresentation.js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Marketplace -> the currency its prices are recorded in. Used for
// labelling only; no conversion happens anywhere in this study.
const CURRENCY = {
  EBAY_US: "USD",
  EBAY_GB: "GBP",
  EBAY_DE: "EUR",
  EBAY_CA: "CAD",
  EBAY_AU: "AUD",
  EBAY_IT: "EUR",
};
// Below this a marketplace is reported but explicitly not characterised.
const MIN_N = 20;

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const cutoff = new Date().toISOString();

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("deals")
    .select(
      "id,listing_id,listing_type,marketplace,price,shipping,total_price,card_tcgplayer_id,card_language,condition,is_graded,grader,grade,is_local"
    )
    .eq("is_active", true)
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  rows.push(...data);
  if (data.length < 1000) break;
}

const active = rows.length;
const fixedPrice = rows.filter((r) => r.listing_type === "FIXED_PRICE");
const seen = new Set();
const deduped = [];
for (const r of fixedPrice) {
  const key = r.listing_id || `id:${r.id}`;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(r);
}
const byState = {};
for (const r of deduped) {
  const s = shippingState(r);
  byState[s] = (byState[s] ?? 0) + 1;
}
const usable = deduped.filter(
  (r) => shippingState(r) === "confirmed" && Number(r.price) > 0 && Number(r.total_price) > 0
);

const marketplaces = [];
for (const [mkt, currency] of Object.entries(CURRENCY)) {
  const g = usable.filter((r) => r.marketplace === mkt);
  if (!g.length) continue;
  const pct = g.map((r) => (Number(r.shipping) / Number(r.price)) * 100);
  marketplaces.push({
    marketplace: mkt,
    label: mkt.replace("EBAY_", ""),
    currency,
    n: g.length,
    medianItem: Number(median(g.map((r) => Number(r.price))).toFixed(2)),
    medianShipping: Number(median(g.map((r) => Number(r.shipping))).toFixed(2)),
    medianShippingPctOfItem: Number(median(pct).toFixed(1)),
    shareAtLeast20Pct: Number(((100 * pct.filter((p) => p >= 20).length) / g.length).toFixed(0)),
    characterised: g.length >= MIN_N,
  });
}
marketplaces.sort((a, b) => b.n - a.n);

// The buyer-facing question: within a set of listings that are genuinely
// comparable on every identity field above, is the cheapest ITEM price
// also the cheapest DELIVERED total?
//
// Rows that cannot be shown comparable to anything are dropped before
// grouping rather than grouped on a blank.
const identified = usable.filter(
  (r) => r.card_tcgplayer_id != null && String(r.card_tcgplayer_id) !== "" && r.condition != null && r.condition !== ""
);
const groupUnidentified = usable.length - identified.length;

const groups = {};
for (const r of identified) {
  const key = [
    r.card_tcgplayer_id,
    r.card_language ?? "",
    r.marketplace,
    r.condition,
    r.is_graded ? "graded" : "raw",
    r.grader ?? "",
    r.grade ?? "",
    r.is_local ? "local" : "cross_border",
  ].join("|");
  (groups[key] = groups[key] ?? []).push(r);
}
const comparable = Object.values(groups).filter((g) => g.length >= 2);

let rankFlips = 0;
let groupsWithItemPriceTie = 0;
let tiesThatWouldHaveFlippedNaively = 0;
for (const g of comparable) {
  const minItem = Math.min(...g.map((r) => Number(r.price)));
  const minDelivered = Math.min(...g.map((r) => Number(r.total_price)));
  const tiedOnItem = g.filter((r) => Number(r.price) === minItem);
  if (tiedOnItem.length > 1) groupsWithItemPriceTie += 1;
  // A reversal only when buying on item price CANNOT reach the cheapest
  // delivered total, however a tie for cheapest item price is broken.
  const reachable = tiedOnItem.some((r) => Number(r.total_price) === minDelivered);
  if (!reachable) rankFlips += 1;
  else if (tiedOnItem.length > 1 && tiedOnItem.some((r) => Number(r.total_price) !== minDelivered)) {
    // a naive "sort and take the first" would have called this a
    // reversal purely because of which tied row happened to sort first
    tiesThatWouldHaveFlippedNaively += 1;
  }
}

const study = {
  generatedAt: cutoff,
  observationCutoff: cutoff,
  // Bumped whenever the eligibility rules or the reversal definition
  // change, so a page can never render figures from one method while
  // describing another. Revision 2 (2026-09-22): stricter comparable-
  // group identity (language, graded/grader/grade, delivery basis) and
  // the tie-safe reversal rule.
  methodRevision: 2,
  minimumNForCharacterisation: MIN_N,
  population: {
    activeRows: active,
    fixedPrice: fixedPrice.length,
    afterDeduplication: deduped.length,
    byShippingState: byState,
    usable: usable.length,
    // Two DIFFERENT ratios, both stated, because conflating them is how
    // the first published version of this page got its arithmetic wrong.
    // `excludedShareOfDeduplicated` is the excluded rows as a share of
    // the deduplicated population; `sampleGrowthIfIncludedPct` is how
    // much larger the ANALYSED sample would be if they were folded in.
    excludedNotConfirmed: deduped.length - usable.length,
    excludedShareOfDeduplicatedPct: deduped.length
      ? Number(((100 * (deduped.length - usable.length)) / deduped.length).toFixed(1))
      : null,
    sampleGrowthIfIncludedPct: usable.length
      ? Number(((100 * (deduped.length - usable.length)) / usable.length).toFixed(1))
      : null,
  },
  marketplaces,
  comparableGroups: {
    // rows that reached the group stage at all
    eligibleRows: identified.length,
    droppedForMissingIdentity: groupUnidentified,
    groups: comparable.length,
    rankFlips,
    rankFlipPct: comparable.length ? Number(((100 * rankFlips) / comparable.length).toFixed(0)) : null,
    // tie diagnostics: published so the reversal count can be read as a
    // real result rather than an artefact of sort order
    groupsWithItemPriceTie: groupsWithItemPriceTie,
    tiesNotCountedAsReversals: tiesThatWouldHaveFlippedNaively,
    identityFields: [
      "card_tcgplayer_id",
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
    "// Source: scripts/studies/buildShippingCostStudy.mjs (read-only over\n" +
    "// retained `deals` records). Frozen so the published figures cannot\n" +
    "// drift from the analysis. Re-running produces a NEW study with a new\n" +
    "// cutoff; it does not update this one in place.\n" +
    `export const STUDY = ${JSON.stringify(study, null, 2)};\n`
);
