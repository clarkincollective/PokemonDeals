// Phase 17C.9 - the sealed scanner's decide-and-write path, extracted so
// the REAL write behaviour can be tested (app/api/refresh-sealed-deals
// calls this; nothing is duplicated).
//
// Why this exists: `sealed_deals` is unique on (source, marketplace,
// listing_id), and PostgREST upsert REPLACES the conflicting row. That
// means the last writer wins, not the first - so a listing already bound
// to the wrong product is repaired the next time the correct product's
// scan sees it. The unique key alone does not prove that, which is what
// tests/scanner/sealed-ingest-17c9.test.mjs exercises.
//
// Reassignment must not carry the previous product's comparison: when the
// row moves to a different product, the old market reference, discount and
// reference provenance are recomputed or cleared here.

import { sealedListingDecision } from "./sealedProductMatch.js";

// Columns that describe the OLD product's comparison. On a product change
// they are cleared (provenance) or overwritten (price/discount, by the
// freshly built row) - never carried across.
export const COMPARISON_PROVENANCE_COLUMNS = Object.freeze([
  "reference_captured_at",
  "reference_condition",
  "reference_printing",
  "reference_grader",
  "reference_grade",
]);

// What must change on the stored row when it is reassigned to `productId`.
// Empty when the row is new or already belongs to this product.
export function reassignmentReset(existing, productId) {
  if (!existing || existing.sealed_watchlist_id === productId) return {};
  const reset = {
    // an identity/price disqualification belonged to the OLD assignment
    disqualified_reason: null,
  };
  for (const c of COMPARISON_PROVENANCE_COLUMNS) reset[c] = null;
  return reset;
}

// One product's listings -> writes. Every dependency is injected so this
// runs under `node --test` with no network and no Supabase.
//   db            .from(table).select(...).eq(...).maybeSingle() / .upsert(row, { onConflict })
//   isTrustworthy (listing) -> boolean          (lib/dealMatching)
//   matchesName   (listing, product) -> boolean (lib/dealMatching)
//   priceListing  (listing, marketPrice) -> { totalLocal, totalUsd, discountPct }
//   buildRow      ({ productId, listing, totalPrice, totalPriceUsd, marketPrice, discountPct }) -> row
export async function ingestSealedListings({
  db,
  product,
  listings,
  marketPrice,
  discountThreshold,
  floorUsd,
  isTrustworthy,
  matchesName,
  priceListing,
  buildRow,
}) {
  const stats = { written: 0, repaired: 0, rejected: {} };
  const reject = (reason) => {
    stats.rejected[reason] = (stats.rejected[reason] ?? 0) + 1;
  };

  for (const listing of listings) {
    if (!isTrustworthy(listing)) {
      reject("untrustworthy");
      continue;
    }
    if (!matchesName(listing, product)) {
      reject("name_tokens");
      continue;
    }
    // The identity decision - edition, product kind, quantity. An
    // ambiguous title is rejected here, so it never reaches the upsert and
    // can never overwrite a valid assignment.
    const decision = sealedListingDecision(listing.title, {
      name: product.name,
      set: product.set,
      productType: product.product_type ?? null,
    });
    if (!decision.ok) {
      reject(decision.reason);
      continue;
    }

    const { totalLocal, totalUsd, discountPct } = priceListing(listing, marketPrice);
    if (discountPct < discountThreshold) {
      reject("below_threshold");
      continue;
    }
    if (floorUsd != null && totalUsd < floorUsd) {
      reject("below_sanity_floor");
      continue;
    }

    // Is this listing already stored, and against which product?
    const { data: existing } = await db
      .from("sealed_deals")
      .select("id, sealed_watchlist_id, market_price, discount_pct")
      .eq("source", "ebay")
      .eq("marketplace", listing.marketplace)
      .eq("listing_id", listing.listingId)
      .maybeSingle();

    const row = {
      ...buildRow({
        productId: product.id,
        listing,
        totalPrice: totalLocal,
        totalPriceUsd: totalUsd,
        marketPrice,
        discountPct,
      }),
      ...reassignmentReset(existing, product.id),
    };

    const { error } = await db.from("sealed_deals").upsert(row, { onConflict: "source,marketplace,listing_id" });
    if (error) {
      reject("write_error");
      continue;
    }
    stats.written += 1;
    if (existing && existing.sealed_watchlist_id !== product.id) stats.repaired += 1;
  }

  return stats;
}
