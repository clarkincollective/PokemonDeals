// sealed-unresolved-2026-09-24 - READ-ONLY freeze + classification of the
// ACTIVE UNRESOLVED sealed cohort.
//
//   node scripts/remediation/sealedUnresolvedFreeze.mjs --out=<file>
//
// "Unresolved" has one meaning here and it is narrow: the shipped identity
// decision (lib/sealedProductMatch.sealedListingDecision) REFUSES the row
// for a reason that is NOT one of finding 1's NOT_A_SEALED_PRODUCT reasons.
// It does not mean the row is wrong. It means correctness has not been
// established either way.
//
// This script performs SELECTs only. It never updates, inserts or deletes,
// and it contains no code that could: the Supabase client is used solely
// through .select(). The frozen JSON it writes is a local artefact.
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import {
  sealedListingDecision,
  productKindOfTitle,
  productKindOfProduct,
  editionOfTitle,
  editionOfSet,
  isMultiUnitLot,
  aliasedProductForTitle,
  NOT_A_SEALED_PRODUCT,
} from "../../lib/sealedProductMatch.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const Q = require(join(REPO, "lib", "dealQuality.js"));

const EL = new Set(NOT_A_SEALED_PRODUCT.map((k) => `kind_mismatch:${k}`));

// Every gate isDisplayableSealedDeal applies, evaluated one at a time, so a
// row hidden by identity ALONE can be told apart from one that has another
// independent reason not to display.
function gateBreakdown(row, now) {
  const p = row.sealed_watchlist;
  const identityOk = Q.sealedRowMatchesItsProduct(row);
  return {
    inactive: row.is_active === false,
    disqualified: Boolean(row.disqualified_reason),
    nonExactCta: !Q.isExactEbayDealDestination(row),
    auctionEnded: Q.auctionEnded(row, now),
    differentExpansion: Q.listingNamesDifferentExpansion(row),
    identityRefused: !identityOk,
    // dealQuality does not export earlyListingLacksAvailability; this is
    // its exact definition, rebuilt from the two helpers it does export,
    // so this stays a read-only diagnosis with no change to lib/.
    earlyLacksAvailability: Boolean(Q.earlyListing(row, now)) && !Q.isPositiveActiveConfirmation(row),
    productMissing: !p || typeof p.name !== "string" || p.name.trim() === "",
    displayable: Q.isDisplayableSealedDeal(row, now),
  };
}

export async function freeze(db, { now = Date.now() } = {}) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("sealed_deals")
      .select(
        "id, title, is_active, disqualified_reason, marketplace, listing_id, listing_url, affiliate_url, " +
          "listing_type, auction_end_at, first_seen_at, last_seen_at, exact_verified_at, image_url, " +
          "price, shipping, total_price, total_price_usd, currency, market_price, discount_pct, " +
          "reference_source, reference_product_id, reference_amount, reference_currency, reference_observed_at, " +
          "sealed_watchlist_id, sealed_watchlist:sealed_watchlist_id (id, name, set, tcgplayer_id, active, source)"
      )
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`sealed_deals read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }

  // Catalogue metadata the MATCHER DOES NOT SEE (the embed carries no
  // product_type). Pulled purely for diagnosis, and labelled as such.
  const ids = [...new Set(rows.map((r) => r.sealed_watchlist?.tcgplayer_id).filter((v) => v != null).map(String))];
  const cat = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from("sealed_catalog")
      .select("tcgplayer_id, name, set, product_type, language, market_price")
      .in("tcgplayer_id", ids.slice(i, i + 200));
    for (const c of data ?? []) cat.set(String(c.tcgplayer_id), c);
  }

  const entries = [];
  for (const row of rows) {
    const p = row.sealed_watchlist;
    const product = p?.name ? { name: p.name, set: p.set ?? null, productType: null } : null;
    const decision = product ? sealedListingDecision(row.title ?? "", product) : { ok: false, reason: "product_row_missing" };
    if (decision.ok) continue; // accepted by the rule - not this cohort
    if (EL.has(decision.reason)) continue; // finding 1's cohort - closed, not this
    if (row.is_active !== true) continue; // ACTIVE cohort only
    const catalogue = p?.tcgplayer_id != null ? cat.get(String(p.tcgplayer_id)) ?? null : null;
    entries.push({
      dealId: row.id,
      title: row.title,
      marketplace: row.marketplace,
      ebayListingId: row.listing_id,
      listingUrl: row.listing_url,
      imageUrl: row.image_url,
      listingType: row.listing_type,
      auctionEndAt: row.auction_end_at,
      isActive: row.is_active,
      disqualifiedReason: row.disqualified_reason,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      exactVerifiedAt: row.exact_verified_at,
      priceUsd: row.total_price_usd,
      marketPrice: row.market_price,
      discountPct: row.discount_pct,
      reference: {
        source: row.reference_source,
        productId: row.reference_product_id,
        amount: row.reference_amount,
        currency: row.reference_currency,
        observedAt: row.reference_observed_at,
      },
      // exactly the identity evidence the matcher is given
      matcherInput: { title: row.title ?? "", product },
      linkedProduct: p ? { id: p.id, name: p.name, set: p.set, tcgplayerId: p.tcgplayer_id, active: p.active, source: p.source } : null,
      // catalogue metadata NOT visible to the matcher - diagnosis only
      catalogueNotSeenByMatcher: catalogue,
      refusal: decision.reason,
      subVerdicts: {
        titleEdition: editionOfTitle(row.title ?? ""),
        productEdition: product ? editionOfSet(product.set) : null,
        titleKind: productKindOfTitle(row.title ?? ""),
        productKind: product ? productKindOfProduct(product) : null,
        multiUnitLot: isMultiUnitLot(row.title ?? ""),
        aliasAvailable: product ? Boolean(aliasedProductForTitle(row.title ?? "", product)) : false,
      },
      gates: gateBreakdown(row, now),
    });
  }
  return { readAt: new Date(now).toISOString(), tableRows: rows.length, cohort: entries };
}

async function main() {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
  for (const line of readFileSync(join(REPO, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const frozen = await freeze(db);

  const byReason = {};
  for (const e of frozen.cohort) (byReason[e.refusal] ??= []).push(e.dealId);
  console.log(`read at        : ${frozen.readAt}`);
  console.log(`sealed_deals   : ${frozen.tableRows}`);
  console.log(`ACTIVE UNRESOLVED cohort: ${frozen.cohort.length}`);
  console.log(`\nrefusal reason (disjoint, first match wins in sealedListingDecision):`);
  for (const [r, ids] of Object.entries(byReason).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(ids.length).padStart(4)}  ${r}`);
  }
  const sum = Object.values(byReason).reduce((n, ids) => n + ids.length, 0);
  console.log(`  ${String(sum).padStart(4)}  TOTAL (must equal the cohort)`);

  const out = arg("out");
  if (out) {
    writeFileSync(out, JSON.stringify({ ...frozen, byReason }, null, 1));
    console.log(`\nfrozen -> ${out}`);
  }
  console.log("\nREAD-ONLY: no row was updated, inserted or deleted.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
