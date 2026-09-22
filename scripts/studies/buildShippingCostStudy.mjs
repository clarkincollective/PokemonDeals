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
//     charge was actually recorded. UNKNOWN AND UNCONFIRMED SHIPPING ARE
//     EXCLUDED, NOT TREATED AS ZERO - that is the whole point of the
//     study and assuming zero would manufacture the finding;
//   * item price > 0 and delivered total > 0.
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
    .select("id,listing_id,listing_type,marketplace,price,shipping,total_price,card_tcgplayer_id,condition")
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
// comparable - same card, same marketplace (so same currency), same
// recorded condition - is the cheapest ITEM price also the cheapest
// DELIVERED total?
const groups = {};
for (const r of usable) {
  const key = `${r.card_tcgplayer_id}|${r.marketplace}|${r.condition ?? ""}`;
  (groups[key] = groups[key] ?? []).push(r);
}
const comparable = Object.values(groups).filter((g) => g.length >= 2);
let rankFlips = 0;
for (const g of comparable) {
  const cheapestItem = [...g].sort((a, b) => Number(a.price) - Number(b.price))[0];
  const cheapestDelivered = [...g].sort((a, b) => Number(a.total_price) - Number(b.total_price))[0];
  if (cheapestItem.id !== cheapestDelivered.id) rankFlips += 1;
}

const study = {
  generatedAt: cutoff,
  observationCutoff: cutoff,
  minimumNForCharacterisation: MIN_N,
  population: {
    activeRows: active,
    fixedPrice: fixedPrice.length,
    afterDeduplication: deduped.length,
    byShippingState: byState,
    usable: usable.length,
  },
  marketplaces,
  comparableGroups: {
    groups: comparable.length,
    rankFlips,
    rankFlipPct: comparable.length ? Number(((100 * rankFlips) / comparable.length).toFixed(0)) : null,
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
