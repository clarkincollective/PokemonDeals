// AUDIT 2026-09-23, FINDING 6 — duplicate marketplace rows.
//
// READ-ONLY reproduction. SELECT only: no update, insert, upsert, delete or
// rpc anywhere in this file, no provider call, no scan. It reads the deals
// table and reports, for the SAME population and cutoff:
//
//   rows                      stored active rows
//   displayable rows          rows that pass the existing display gate
//   distinct listings         those rows grouped by eBay listing identity
//   multi-marketplace         listings stored for 2+ marketplaces
//   inflation                 displayable rows / distinct listings
//
// and the same figures per affected surface (card hubs, species tiles).
//
//   node scripts/integrity/auditDuplicateListings.mjs [--json] [--limit N]

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// .env.local, same as the remediation scripts
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { createClient } = require("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { isDisplayableDeal } = await import(new URL("../../lib/dealQuality.js", import.meta.url));

const JSON_OUT = process.argv.includes("--json");

// The two competing identity rules in the codebase today.
const keyWithMarketplace = (r) => `${r.marketplace ?? "?"}:${r.listing_id ?? r.id}`; // lib/speciesDealScope
const keyListingOnly = (r) => String(r.listing_id ?? `row:${r.id}`); // lib/allDealsInventory

// The bare eBay item number, ignoring the variation component. Used only
// to SEPARATE the two cases - it is NOT the grouping key, because two
// variations of one listing are genuinely different offers.
const legacyId = (listingId) => {
  const s = String(listingId ?? "");
  const m = s.match(/^v\d+\|(\d+)\|/) || s.match(/^(\d+)$/);
  return m ? m[1] : null;
};

async function pageAll(select, build) {
  const out = [];
  const SIZE = 1000;
  for (let from = 0; ; from += SIZE) {
    let q = db.from("deals").select(select).range(from, from + SIZE - 1);
    q = build(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < SIZE) break;
  }
  return out;
}

const CUTOFF = new Date().toISOString();
const rows = await pageAll("*", (q) => q.eq("is_active", true).eq("source", "ebay"));

const displayable = rows.filter((r) => isDisplayableDeal(r));

function census(list) {
  const byMarketplaceKey = new Set();
  const byListing = new Map();
  for (const r of list) {
    byMarketplaceKey.add(keyWithMarketplace(r));
    const k = keyListingOnly(r);
    if (!byListing.has(k)) byListing.set(k, []);
    byListing.get(k).push(r);
  }
  let multiMarketplace = 0;
  let extraRows = 0;
  const examples = [];
  for (const [k, copies] of byListing) {
    const markets = new Set(copies.map((c) => c.marketplace));
    if (markets.size > 1) {
      multiMarketplace++;
      extraRows += copies.length - 1;
      if (examples.length < 8) {
        examples.push({
          listing_id: k,
          legacy: legacyId(k),
          copies: copies.length,
          marketplaces: [...markets].sort(),
          ids: copies.map((c) => c.id).sort((a, b) => a - b),
          currencies: [...new Set(copies.map((c) => c.currency))].sort(),
          totals: copies.map((c) => `${c.marketplace}:${c.currency} ${c.total_price} (usd ${c.total_price_usd})`),
          shipping: copies.map((c) => `${c.marketplace}:${c.shipping ?? "null"}`),
          card: copies[0].card_name ?? copies[0].title?.slice(0, 50),
        });
      }
    }
  }
  return {
    rows: list.length,
    keysWithMarketplace: byMarketplaceKey.size,
    distinctListings: byListing.size,
    multiMarketplace,
    extraRows,
    examples,
  };
}

const all = census(rows);
const shown = census(displayable);

// Per-card view: how many hubs would show an inflated option count, and by
// how much. Scoped exactly the way fetchCardOffers scopes a hub.
const byCard = new Map();
for (const r of displayable) {
  const c = r.card_tcgplayer_id ?? (r.watchlist_id != null ? `w:${r.watchlist_id}` : `d:${r.id}`);
  if (!byCard.has(c)) byCard.set(c, []);
  byCard.get(c).push(r);
}
let hubsInflated = 0;
let hubsWithOffers = 0;
const worstHubs = [];
for (const [card, list] of byCard) {
  const withMp = new Set(list.map(keyWithMarketplace)).size;
  const listingOnly = new Set(list.map(keyListingOnly)).size;
  if (withMp > 0) hubsWithOffers++;
  if (withMp > listingOnly) {
    hubsInflated++;
    worstHubs.push({ card, shownToday: withMp, actuallyDistinct: listingOnly, inflatedBy: withMp - listingOnly, name: list[0].card_name });
  }
}
worstHubs.sort((a, b) => b.inflatedBy - a.inflatedBy || b.shownToday - a.shownToday);

// Variation check: are any same-legacy groups actually DIFFERENT variations
// (which must NOT be collapsed)?
const byLegacy = new Map();
for (const r of displayable) {
  const l = legacyId(r.listing_id);
  if (!l) continue;
  if (!byLegacy.has(l)) byLegacy.set(l, new Set());
  byLegacy.get(l).add(String(r.listing_id));
}
const multiVariation = [...byLegacy.entries()].filter(([, ids]) => ids.size > 1);

// Rows with no usable listing identity at all
const noIdentity = displayable.filter((r) => !r.listing_id);

const report = {
  cutoff: CUTOFF,
  population: "deals where is_active = true and source = 'ebay'",
  all,
  displayable: shown,
  hubs: { withOffers: hubsWithOffers, inflated: hubsInflated, worst: worstHubs.slice(0, 10) },
  multiVariationListings: multiVariation.length,
  multiVariationExamples: multiVariation.slice(0, 5).map(([l, ids]) => ({ legacy: l, listingIds: [...ids] })),
  rowsWithNoListingId: noIdentity.length,
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`# finding 6 — duplicate marketplace rows (READ-ONLY)`);
  console.log(`population: ${report.population}`);
  console.log(`cutoff:     ${CUTOFF}\n`);
  for (const [label, c] of [["ALL ACTIVE", all], ["DISPLAYABLE (the gate the grids use)", shown]]) {
    console.log(`## ${label}`);
    console.log(`  stored rows                          ${c.rows}`);
    console.log(`  keys under marketplace+listing_id    ${c.keysWithMarketplace}   <- what the grids count today`);
    console.log(`  distinct eBay listings               ${c.distinctListings}   <- actual buying options`);
    console.log(`  listings stored for 2+ marketplaces  ${c.multiMarketplace}`);
    console.log(`  surplus rows from those              ${c.extraRows}`);
    const inflation = c.distinctListings ? (c.keysWithMarketplace / c.distinctListings).toFixed(3) : "n/a";
    console.log(`  inflation factor                     ${inflation}x\n`);
  }
  console.log(`## card hubs`);
  console.log(`  hubs with at least one displayable offer  ${hubsWithOffers}`);
  console.log(`  hubs showing an inflated option count     ${hubsInflated}`);
  for (const h of worstHubs.slice(0, 10)) {
    console.log(`    ${String(h.name ?? h.card).slice(0, 44).padEnd(46)} shows ${h.shownToday} -> ${h.actuallyDistinct} (+${h.inflatedBy})`);
  }
  console.log(`\n## must NOT be collapsed`);
  console.log(`  one item number with several VARIATION ids  ${multiVariation.length}`);
  for (const [l, ids] of multiVariation.slice(0, 5)) console.log(`    ${l}: ${[...ids].join(", ")}`);
  console.log(`\n## ambiguous identity`);
  console.log(`  displayable rows with no listing_id        ${noIdentity.length}`);
  console.log(`\n## examples (displayable, same listing across marketplaces)`);
  for (const e of shown.examples) {
    console.log(`  ${e.listing_id}  ${String(e.card ?? "").slice(0, 40)}`);
    console.log(`    row ids       ${e.ids.join(", ")}`);
    console.log(`    marketplaces  ${e.marketplaces.join(", ")}`);
    console.log(`    totals        ${e.totals.join(" | ")}`);
    console.log(`    shipping      ${e.shipping.join(" | ")}`);
  }
}
